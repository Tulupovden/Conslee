package proxy

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"

	"conslee/internal/config"
)

// Request types

type CreateServiceRequest struct {
	Name           string   `json:"name"`
	Host           string   `json:"host"`
	Containers     []string `json:"containers"`
	TargetURL      string   `json:"targetUrl"`
	Mode           string   `json:"mode"`
	IdleTimeout    string   `json:"idleTimeout"`
	StartupTimeout string   `json:"startupTimeout"`
	HealthPath     string   `json:"healthPath"`
	Schedule       *struct {
		Days  []string `json:"days"`
		Start string   `json:"start"`
		Stop  string   `json:"stop"`
	} `json:"schedule,omitempty"`
}

type UpdateSystemRequest struct {
	ListenAddr         *string `json:"listenAddr,omitempty"`
	IdleReaperInterval *string `json:"idleReaperInterval,omitempty"`
}

type UpdateServiceRequest struct {
	Mode        *string `json:"mode,omitempty"`
	IdleTimeout *string `json:"idleTimeout,omitempty"`
	Schedule    *struct {
		Days  *[]string `json:"days,omitempty"`
		Start *string   `json:"start,omitempty"`
		Stop  *string   `json:"stop,omitempty"`
	} `json:"schedule,omitempty"`
	Containers     *[]string `json:"containers,omitempty"`
	TargetURL      *string   `json:"targetUrl,omitempty"`
	HealthPath     *string   `json:"healthPath,omitempty"`
	StartupTimeout *string   `json:"startupTimeout,omitempty"`
	Host           *string   `json:"host,omitempty"`
	Enabled        *bool     `json:"enabled,omitempty"`
}

const probeAllowWakeHeader = "X-Conslee-Probe-Allow-Wake"
const probeSignatureHeader = "X-Conslee-Service"

// Probe types

type ProbeRequest struct {
	URL        string `json:"url"`
	ExpectHost string `json:"expectHost,omitempty"`
	AllowWake  bool   `json:"allowWake"`
	RequireSig bool   `json:"requireSignature"`
}

type ProbeResponse struct {
	Status     string `json:"status"`
	StatusCode int    `json:"statusCode,omitempty"`
	FinalURL   string `json:"finalUrl,omitempty"`
	Error      string `json:"error,omitempty"`
}

func (c *Conslee) serviceStatus(ctx context.Context, svc *ServiceState) (*ServiceStatusDTO, error) {
	names := svc.Config.Containers
	if len(names) == 0 && svc.Config.ContainerName != "" {
		names = []string{svc.Config.ContainerName}
	}

	running := false
	for _, name := range names {
		st, err := c.rt.Inspect(ctx, name)
		if err != nil {
			if errorsIsCtx(err) {
				return nil, err
			}
			log.Printf("inspect %s error in serviceStatus: %v", name, err)
			continue
		}
		if st.Running {
			running = true
			break
		}
	}

	dto := &ServiceStatusDTO{
		Name:           svc.Config.Name,
		Host:           svc.Config.Host,
		Containers:     names,
		Mode:           svc.Config.Mode,
		Enabled:        !svc.Config.Disabled,
		Running:        running,
		LastActivity:   svc.LastActivity,
		IdleTimeout:    svc.Config.IdleTimeout.String(),
		StartupTimeout: svc.Config.StartupTimeout.String(),
		TargetURL:      svc.Config.TargetURL,
		HealthPath:     svc.Config.HealthPath,
	}

	if svc.Config.Schedule != nil && svc.Schedule != nil {
		dto.Schedule = &ServiceScheduleDTO{
			Mode:  svc.Schedule.ModeString(),
			Days:  svc.Config.Schedule.Days,
			Start: svc.Config.Schedule.Start,
			Stop:  svc.Config.Schedule.Stop,
		}
	}

	return dto, nil
}

// Helper functions

func errorsIsCtx(err error) bool {
	return errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded)
}

// extractServiceNameFromPath extracts service name from URL path patterns like:
// /api/services/{name}/start, /api/services/{name}/stop, /api/services/{name}/settings, /api/services/{name}
func extractServiceNameFromPath(path string, suffix string) string {
	name := strings.TrimPrefix(path, "/api/services/")
	if suffix != "" {
		name = strings.TrimSuffix(name, suffix)
	}
	return strings.Trim(name, "/")
}

// Service handlers

// GET /api/services
func (c *Conslee) HandleListServices(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	var out []*ServiceStatusDTO

	for _, svc := range c.reg.All() {
		status, err := c.serviceStatus(ctx, svc)
		if err != nil {
			if errorsIsCtx(err) {
				return
			}
			log.Printf("serviceStatus error for %s: %v", svc.Config.Name, err)
			continue
		}
		out = append(out, status)
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}

// POST /api/services/{name}/start
func (c *Conslee) HandleStartService(w http.ResponseWriter, r *http.Request) {
	name := extractServiceNameFromPath(r.URL.Path, "/start")
	if name == "" {
		http.Error(w, "service name required", http.StatusBadRequest)
		return
	}

	svc, ok := c.reg.GetByName(name)
	if !ok {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	if err := ensureRunning(r.Context(), c.rt, svc); err != nil {
		log.Printf("start service %s: %v", name, err)
		http.Error(w, "cannot start service", http.StatusInternalServerError)
		return
	}
	svc.LastActivity = time.Now()
	w.WriteHeader(http.StatusNoContent)
}

// POST /api/services/{name}/stop
func (c *Conslee) HandleStopService(w http.ResponseWriter, r *http.Request) {
	name := extractServiceNameFromPath(r.URL.Path, "/stop")
	if name == "" {
		http.Error(w, "service name required", http.StatusBadRequest)
		return
	}

	svc, ok := c.reg.GetByName(name)
	if !ok {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	c.stopServiceContainers(ctx, svc)

	if err := c.saveConfig(); err != nil {
		log.Printf("save config error for %s: %v", svc.Config.Name, err)
	}

	w.WriteHeader(http.StatusNoContent)
}

func (c *Conslee) stopServiceContainers(ctx context.Context, svc *ServiceState) {
	names := append([]string(nil), svc.Config.Containers...)
	if len(names) == 0 && svc.Config.ContainerName != "" {
		names = []string{svc.Config.ContainerName}
	}
	for _, n := range names {
		if err := c.rt.Stop(ctx, n, 0); err != nil {
			log.Printf("stop %s error: %v", n, err)
		}
	}
}

// POST /api/services
func (c *Conslee) HandleCreateService(w http.ResponseWriter, r *http.Request) {
	var req CreateServiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	mode := strings.TrimSpace(req.Mode)
	if mode == "" {
		mode = "on_demand"
	}

	host := strings.TrimSpace(req.Host)

	if req.Name == "" {
		http.Error(w, "name is required", http.StatusBadRequest)
		return
	}

	if mode != "schedule_only" && host == "" {
		http.Error(w, "host is required unless mode is schedule_only", http.StatusBadRequest)
		return
	}

	if mode != "schedule_only" && req.TargetURL == "" {
		http.Error(w, "targetUrl is required unless mode is schedule_only", http.StatusBadRequest)
		return
	}

	if _, ok := c.reg.GetByName(req.Name); ok {
		http.Error(w, "service with this name already exists", http.StatusConflict)
		return
	}

	if host != "" {
		if _, ok := c.reg.GetByHost(host); ok {
			http.Error(w, "host already used", http.StatusConflict)
			return
		}
	}

	if svcName, containerName := c.reg.FindContainerConflict(req.Containers, ""); svcName != "" {
		http.Error(
			w,
			fmt.Sprintf("container %q already used by service %q", containerName, svcName),
			http.StatusConflict,
		)
		return
	}

	idleRaw := req.IdleTimeout
	if idleRaw == "" {
		idleRaw = "0s"
	}
	idle, err := time.ParseDuration(idleRaw)
	if err != nil {
		http.Error(w, "invalid idleTimeout", http.StatusBadRequest)
		return
	}
	startup, err := time.ParseDuration(req.StartupTimeout)
	if err != nil {
		http.Error(w, "invalid startupTimeout", http.StatusBadRequest)
		return
	}

	var parsedTarget *url.URL
	if req.TargetURL != "" {
		u, err := url.Parse(req.TargetURL)
		if err != nil {
			http.Error(w, "invalid targetUrl", http.StatusBadRequest)
			return
		}
		parsedTarget = u
	}

	cfgSvc := config.ServiceConfig{
		Name:              req.Name,
		Host:              host,
		Containers:        req.Containers,
		TargetURL:         req.TargetURL,
		Mode:              mode,
		RawIdleTimeout:    idleRaw,
		IdleTimeout:       idle,
		RawStartupTimeout: req.StartupTimeout,
		StartupTimeout:    startup,
		HealthPath:        req.HealthPath,
	}

	if req.Schedule != nil {
		cfgSvc.Schedule = &config.ScheduleConfig{
			Days:  req.Schedule.Days,
			Start: req.Schedule.Start,
			Stop:  req.Schedule.Stop,
		}
	}

	st := &ServiceState{
		Config:       cfgSvc,
		Target:       parsedTarget,
		LastActivity: time.Now(),
		Schedule:     ParseSchedule(cfgSvc.Schedule, cfgSvc.Mode),
	}
	c.reg.Add(cfgSvc.Host, st)

	if err := c.saveConfig(); err != nil {
		log.Printf("save config after create service error: %v", err)
	}

	w.WriteHeader(http.StatusCreated)
}

// DELETE /api/services/{name}
func (c *Conslee) HandleDeleteService(w http.ResponseWriter, r *http.Request) {
	name := extractServiceNameFromPath(r.URL.Path, "")
	if name == "" {
		http.Error(w, "service name required", http.StatusBadRequest)
		return
	}

	if _, ok := c.reg.GetByName(name); !ok {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	c.reg.DelByName(name)

	if err := c.saveConfig(); err != nil {
		log.Printf("save config after delete service error: %v", err)
	}

	w.WriteHeader(http.StatusNoContent)
}

// POST /api/services/{name}/settings
func (c *Conslee) HandleUpdateService(w http.ResponseWriter, r *http.Request) {
	name := extractServiceNameFromPath(r.URL.Path, "/settings")
	if name == "" {
		http.Error(w, "service name required", http.StatusBadRequest)
		return
	}

	svc, ok := c.reg.GetByName(name)
	if !ok {
		http.Error(w, "service not found", http.StatusNotFound)
		return
	}

	var req UpdateServiceRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	desiredMode := svc.Config.Mode
	modeChanged := false
	if req.Mode != nil && *req.Mode != "" {
		switch *req.Mode {
		case "on_demand", "schedule_only", "both":
			desiredMode = *req.Mode
			modeChanged = true
		default:
			http.Error(w, "invalid mode", http.StatusBadRequest)
			return
		}
	}

	// HOST
	if req.Host != nil {
		newHost := strings.TrimSpace(*req.Host)
		if desiredMode != "schedule_only" && newHost == "" {
			http.Error(w, "host is required unless mode is schedule_only", http.StatusBadRequest)
			return
		}
		if newHost != svc.Config.Host {
			if newHost != "" {
				if other, ok := c.reg.GetByHost(newHost); ok && other != svc {
					http.Error(w, "host already used", http.StatusConflict)
					return
				}
			}
			c.reg.UpdateHost(svc, newHost)
		}
	}

	if req.Enabled != nil {
		previouslyDisabled := svc.Config.Disabled
		svc.Config.Disabled = !*req.Enabled
		if !svc.Config.Disabled && previouslyDisabled {
			svc.LastActivity = time.Now()
		}
	}

	if modeChanged {
		svc.Config.Mode = desiredMode
		if svc.Schedule != nil {
			switch desiredMode {
			case "schedule_only":
				svc.Schedule.Mode = ModeScheduleOnly
			case "both":
				svc.Schedule.Mode = ModeBoth
			default:
				svc.Schedule.Mode = ModeOnDemand
			}
		}
	}

	// IDLE TIMEOUT
	if req.IdleTimeout != nil && *req.IdleTimeout != "" {
		d, err := time.ParseDuration(*req.IdleTimeout)
		if err != nil {
			http.Error(w, "invalid idleTimeout", http.StatusBadRequest)
			return
		}
		svc.Config.IdleTimeout = d
		svc.Config.RawIdleTimeout = *req.IdleTimeout
	}

	// SCHEDULE
	if req.Schedule != nil {
		if svc.Config.Schedule == nil {
			svc.Config.Schedule = &config.ScheduleConfig{}
		}
		sc := svc.Config.Schedule

		if req.Schedule.Days != nil {
			sc.Days = *req.Schedule.Days
		}
		if req.Schedule.Start != nil {
			sc.Start = *req.Schedule.Start
		}
		if req.Schedule.Stop != nil {
			sc.Stop = *req.Schedule.Stop
		}

		svc.Schedule = ParseSchedule(sc, svc.Config.Mode)
	}

	// CONTAINERS
	if req.Containers != nil {
		newContainers := *req.Containers

		if svcName, containerName := c.reg.FindContainerConflict(newContainers, svc.Config.Name); svcName != "" {
			http.Error(
				w,
				fmt.Sprintf("container %q already used by service %q", containerName, svcName),
				http.StatusConflict,
			)
			return
		}

		svc.Config.Containers = newContainers
	}

	// TARGET URL
	if req.TargetURL != nil && *req.TargetURL != "" {
		u, err := url.Parse(*req.TargetURL)
		if err != nil {
			http.Error(w, "invalid targetUrl", http.StatusBadRequest)
			return
		}
		svc.Config.TargetURL = *req.TargetURL
		svc.Target = u
	}

	// HEALTH PATH
	if req.HealthPath != nil {
		svc.Config.HealthPath = *req.HealthPath
	}

	// STARTUP TIMEOUT
	if req.StartupTimeout != nil && *req.StartupTimeout != "" {
		d, err := time.ParseDuration(*req.StartupTimeout)
		if err != nil {
			http.Error(w, "invalid startupTimeout", http.StatusBadRequest)
			return
		}
		svc.Config.StartupTimeout = d
		svc.Config.RawStartupTimeout = *req.StartupTimeout
	}

	if err := c.saveConfig(); err != nil {
		log.Printf("save config error for %s: %v", svc.Config.Name, err)
	}

	w.WriteHeader(http.StatusNoContent)
}

// System handlers

// GET /api/system
func (c *Conslee) HandleGetSystem(w http.ResponseWriter, r *http.Request) {
	if c.cfg == nil {
		http.Error(w, "no config", http.StatusInternalServerError)
		return
	}

	dto := &SystemStatusDTO{
		ListenAddr:         c.cfg.Server.ListenAddr,
		IdleReaperInterval: c.cfg.IdleReaper.Interval.String(),
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(dto)
}

// POST /api/probes
func (c *Conslee) HandleProbe(w http.ResponseWriter, r *http.Request) {
	var req ProbeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	req.URL = strings.TrimSpace(req.URL)
	if req.URL == "" {
		http.Error(w, "url is required", http.StatusBadRequest)
		return
	}

	result := performProbe(r.Context(), &req)

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(result)
}

// Probe functions

func performProbe(ctx context.Context, req *ProbeRequest) *ProbeResponse {
	client := &http.Client{
		Timeout: 5 * time.Second,
	}

	headResult, headErr := doProbeRequest(ctx, client, http.MethodHead, req)
	if headErr == nil && headResult.Status == "healthy" {
		return headResult
	}

	getResult, getErr := doProbeRequest(ctx, client, http.MethodGet, req)
	if getErr != nil {
		if headErr != nil {
			return &ProbeResponse{
				Status: "unhealthy",
				Error:  headErr.Error(),
			}
		}
		return &ProbeResponse{
			Status: "unhealthy",
			Error:  getErr.Error(),
		}
	}

	return getResult
}

func doProbeRequest(ctx context.Context, client *http.Client, method string, req *ProbeRequest) (*ProbeResponse, error) {
	httpReq, err := http.NewRequestWithContext(ctx, method, req.URL, nil)
	if err != nil {
		return nil, err
	}

	if !req.AllowWake {
		httpReq.Header.Set(probeAllowWakeHeader, "false")
	}

	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	_, _ = io.Copy(io.Discard, resp.Body)

	result := &ProbeResponse{
		StatusCode: resp.StatusCode,
		Status:     "unhealthy",
	}

	if resp.Request != nil && resp.Request.URL != nil {
		result.FinalURL = resp.Request.URL.String()
	}

	if resp.StatusCode >= 200 && resp.StatusCode < 400 {
		if req.RequireSig {
			if resp.Header.Get(probeSignatureHeader) == "" {
				result.Error = "missing conslee signature"
				return result, nil
			}
		}
		if req.ExpectHost != "" && resp.Request != nil && resp.Request.URL != nil {
			expectedHost := strings.ToLower(req.ExpectHost)
			actualHost := strings.ToLower(resp.Request.URL.Host)
			if actualHost != expectedHost {
				result.Error = fmt.Sprintf("redirected to %s", actualHost)
				return result, nil
			}
		}
		result.Status = "healthy"
		return result, nil
	}

	if resp.Status != "" && result.Error == "" {
		result.Error = resp.Status
	}

	return result, nil
}

// GET /api/system/check-port
func (c *Conslee) HandleCheckPort(w http.ResponseWriter, r *http.Request) {
	listenAddr := r.URL.Query().Get("listenAddr")
	if listenAddr == "" {
		http.Error(w, "listenAddr parameter required", http.StatusBadRequest)
		return
	}

	// Validate format
	if !strings.HasPrefix(listenAddr, ":") && !strings.Contains(listenAddr, ":") {
		http.Error(w, "invalid listenAddr format", http.StatusBadRequest)
		return
	}

	if c.cfg != nil && listenAddr == c.cfg.Server.ListenAddr {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": true,
		})
		return
	}

	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"available": false,
			"error":     err.Error(),
		})
		return
	}
	ln.Close()

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"available": true,
	})
}

// POST /api/system
func (c *Conslee) HandleUpdateSystem(w http.ResponseWriter, r *http.Request) {
	if c.cfg == nil {
		http.Error(w, "no config", http.StatusInternalServerError)
		return
	}

	var req UpdateSystemRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid json", http.StatusBadRequest)
		return
	}

	portChanged := false
	if req.ListenAddr != nil && *req.ListenAddr != "" {
		// Validate format
		if !strings.HasPrefix(*req.ListenAddr, ":") && !strings.Contains(*req.ListenAddr, ":") {
			http.Error(w, "invalid listenAddr format", http.StatusBadRequest)
			return
		}
		if c.cfg.Server.ListenAddr != *req.ListenAddr {
			portChanged = true
			c.cfg.Server.ListenAddr = *req.ListenAddr
		}
	}

	if req.IdleReaperInterval != nil && *req.IdleReaperInterval != "" {
		d, err := time.ParseDuration(*req.IdleReaperInterval)
		if err != nil {
			http.Error(w, "invalid idleReaperInterval", http.StatusBadRequest)
			return
		}
		c.cfg.IdleReaper.RawInterval = *req.IdleReaperInterval
		c.cfg.IdleReaper.Interval = d
	}

	if err := c.saveConfig(); err != nil {
		log.Printf("save system config error: %v", err)
		http.Error(w, "failed to save config", http.StatusInternalServerError)
		return
	}

	// If port changed, request restart in background
	if portChanged {
		go func() {
			time.Sleep(500 * time.Millisecond) // Give time for response to be sent
			if err := c.RequestRestart(); err != nil {
				log.Printf("failed to request restart: %v", err)
			}
		}()
	}

	w.WriteHeader(http.StatusNoContent)
}

// Docker handlers

// GET /api/docker/containers
func (c *Conslee) HandleListContainers(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	list, err := c.rt.List(ctx, true)
	if err != nil {
		http.Error(w, "docker error", http.StatusInternalServerError)
		log.Printf("ContainerList error: %v", err)
		return
	}

	var out []DockerContainerDTO
	for _, ci := range list {
		var ports []DockerPortDTO
		for _, p := range ci.Ports {
			ports = append(ports, DockerPortDTO(p))
		}
		out = append(out, DockerContainerDTO{
			ID:     ci.ID,
			Name:   ci.Name,
			Image:  ci.Image,
			State:  ci.State,
			Status: ci.Status,
			Ports:  ports,
			Stack:  ci.Stack,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(out)
}
