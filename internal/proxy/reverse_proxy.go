package proxy

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Container lifecycle

func ensureRunning(ctx context.Context, rt ContainerRuntime, svc *ServiceState) error {
	names := svc.Config.Containers
	if len(names) == 0 && svc.Config.ContainerName != "" {
		names = []string{svc.Config.ContainerName}
	}
	if len(names) == 0 {
		return fmt.Errorf("service %s has no containers", svc.Config.Name)
	}

	timeout := svc.Config.StartupTimeout
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	opCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	needWait := false

	for _, name := range names {
		st, err := rt.Inspect(opCtx, name)
		if err != nil {
			return fmt.Errorf("inspect %s: %w", name, err)
		}
		if st.Running {
			continue
		}
		log.Printf("starting container %s for service %s...", name, svc.Config.Name)
		if err := rt.Start(opCtx, name); err != nil {
			return fmt.Errorf("start %s: %w", name, err)
		}
		needWait = true
	}

	if !needWait {
		return nil
	}

	hostPort := ""
	if svc.Target != nil {
		hostPort = svc.Target.Host
	}
	if hostPort == "" {
		log.Printf("service %s: no TargetURL/Host, skipping TCP/HTTP readiness check", svc.Config.Name)
		return nil
	}

	if err := waitTCP(opCtx, hostPort, timeout); err != nil {
		return err
	}
	if err := waitHTTP(opCtx, svc.Target, svc.Config.HealthPath, timeout); err != nil {
		return err
	}

	return nil
}

// Reverse proxy

func (c *Conslee) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	host := r.Host
	svc, ok := c.reg.GetByHost(host)
	if !ok {
		if r.URL.Path == "/" || r.URL.Path == "" {
			http.Redirect(w, r, "/ui/", http.StatusFound)
			return
		}
		log.Printf("unknown host: %s", host)
		http.Error(w, "unknown host", http.StatusBadGateway)
		return
	}

	if svc.Config.Disabled {
		http.Error(w, "service is disabled", http.StatusServiceUnavailable)
		return
	}

	allowWakeHeader := strings.TrimSpace(strings.ToLower(r.Header.Get(probeAllowWakeHeader)))
	skipEnsure := allowWakeHeader == "false" || allowWakeHeader == "0" || allowWakeHeader == "no"

	now := time.Now()
	shouldUp := false
	mode := ModeOnDemand
	if svc.Schedule != nil {
		shouldUp = svc.ShouldBeUp(now)
		mode = svc.Schedule.Mode
	}

	switch mode {
	case ModeScheduleOnly:
		if !shouldUp {
			http.Error(w, "service is disabled by schedule", http.StatusServiceUnavailable)
			return
		}
		fallthrough
	case ModeBoth, ModeOnDemand:
		if skipEnsure {
			w.Header().Set(probeSignatureHeader, svc.Config.Name)
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if err := ensureRunning(r.Context(), c.rt, svc); err != nil {
			log.Printf("ensureRunning error for %s: %v", svc.Config.Name, err)
			http.Error(w, "backend unavailable", http.StatusBadGateway)
			return
		}
	}

	if svc.Target == nil {
		http.Error(w, "service has no target configured", http.StatusServiceUnavailable)
		return
	}

	svc.LastActivity = time.Now()

	proxy := newSingleHostReverseProxy(svc.Target, r)
	proxy.ModifyResponse = func(resp *http.Response) error {
		resp.Header.Set(probeSignatureHeader, svc.Config.Name)
		return nil
	}
	proxy.ServeHTTP(w, r)
}

func newSingleHostReverseProxy(target *url.URL, src *http.Request) *httputil.ReverseProxy {
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.Transport = &http.Transport{
		Proxy:             http.ProxyFromEnvironment,
		DialContext:       (&net.Dialer{Timeout: 10 * time.Second, KeepAlive: 0}).DialContext,
		ForceAttemptHTTP2: false,
		DisableKeepAlives: true,
		TLSClientConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}
	orig := proxy.Director
	proxy.Director = func(req *http.Request) {
		orig(req)
		req.Host = src.Host
		copyHeaders(src, req)
		setForwardedHeaders(src, req)
	}
	proxy.ErrorHandler = func(rw http.ResponseWriter, req *http.Request, err error) {
		log.Printf("proxy error for host=%s path=%s: %v", src.Host, req.URL.Path, err)
		http.Error(rw, "proxy error", http.StatusBadGateway)
	}
	return proxy
}

// Header handling

func copyHeaders(src, dst *http.Request) {
	hopByHopHeaders := map[string]bool{
		"Connection":          true,
		"Keep-Alive":          true,
		"Proxy-Authenticate":  true,
		"Proxy-Authorization": true,
		"Te":                  true,
		"Trailers":            true,
		"Transfer-Encoding":   true,
		"Upgrade":             true,
	}

	for key, values := range src.Header {
		if hopByHopHeaders[key] {
			continue
		}
		dst.Header[key] = values
	}

	// Handle Connection header for WebSocket upgrades
	if conn := src.Header.Get("Connection"); conn != "" {
		dst.Header.Set("Connection", conn)
	}

	// Handle Upgrade header for WebSocket
	if upgrade := src.Header.Get("Upgrade"); upgrade != "" {
		dst.Header.Set("Upgrade", upgrade)
	}
}

// setForwardedHeaders sets X-Real-IP, X-Forwarded-For, X-Forwarded-Host, and X-Forwarded-Proto headers
func setForwardedHeaders(src, dst *http.Request) {
	// Handle X-Real-IP: forward if exists, otherwise set from RemoteAddr
	if v := src.Header.Get("X-Real-IP"); v != "" {
		dst.Header.Set("X-Real-IP", v)
	} else if ip := extractIPFromRemoteAddr(src.RemoteAddr); ip != "" {
		dst.Header.Set("X-Real-IP", ip)
	}

	// Handle X-Forwarded-For: append client IP
	clientIP := extractIPFromRemoteAddr(src.RemoteAddr)
	if clientIP == "" {
		clientIP = getClientIP(src)
	}
	if clientIP != "" {
		if existing := src.Header.Get("X-Forwarded-For"); existing != "" {
			dst.Header.Set("X-Forwarded-For", existing+", "+clientIP)
		} else {
			dst.Header.Set("X-Forwarded-For", clientIP)
		}
	} else if v := src.Header.Get("X-Forwarded-For"); v != "" {
		dst.Header.Set("X-Forwarded-For", v)
	}

	// Handle X-Forwarded-Host
	if v := src.Header.Get("X-Forwarded-Host"); v != "" {
		dst.Header.Set("X-Forwarded-Host", v)
	} else {
		dst.Header.Set("X-Forwarded-Host", src.Host)
	}

	// Handle X-Forwarded-Proto
	if v := src.Header.Get("X-Forwarded-Proto"); v != "" {
		dst.Header.Set("X-Forwarded-Proto", v)
	} else if src.TLS != nil {
		dst.Header.Set("X-Forwarded-Proto", "https")
	} else {
		dst.Header.Set("X-Forwarded-Proto", "http")
	}
}

// extractIPFromRemoteAddr extracts IP address from RemoteAddr string
func extractIPFromRemoteAddr(remoteAddr string) string {
	if remoteAddr == "" {
		return ""
	}
	ip, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		// If SplitHostPort fails, assume the whole string is the IP
		return remoteAddr
	}
	return ip
}

// getClientIP extracts the client IP address from the request headers
// Used as fallback when RemoteAddr is not available
func getClientIP(r *http.Request) string {
	// Check X-Real-IP first (set by upstream proxy)
	if ip := r.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	// Check X-Forwarded-For (may contain multiple IPs, take the first)
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		ips := strings.Split(forwarded, ",")
		if len(ips) > 0 {
			return strings.TrimSpace(ips[0])
		}
	}
	return ""
}
