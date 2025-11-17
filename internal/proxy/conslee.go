package proxy

import (
	"fmt"
	"net/http"
	"net/url"
	"os"
	"sync"
	"syscall"
	"time"

	"conslee/internal/config"
)

type Conslee struct {
	rt  ContainerRuntime
	reg *ServiceRegistry

	cfg        *config.Config
	configPath string
	configMu   sync.Mutex

	server   *http.Server
	serverMu sync.Mutex
}

// Initialization

func New(cfg *config.Config, configPath string) (*Conslee, error) {
	rt, err := NewDockerRuntime()
	if err != nil {
		return nil, err
	}
	reg := NewRegistry()

	for _, s := range cfg.Services {
		var u *url.URL
		if s.TargetURL != "" {
			parsed, err := url.Parse(s.TargetURL)
			if err != nil {
				return nil, err
			}
			u = parsed
		}
		st := &ServiceState{
			Config:       s,
			Target:       u,
			LastActivity: time.Now(),
			Schedule:     ParseSchedule(s.Schedule, s.Mode),
		}
		reg.Add(s.Host, st)
	}

	return &Conslee{
		rt:         rt,
		reg:        reg,
		cfg:        cfg,
		configPath: configPath,
	}, nil
}

// Config management

func (c *Conslee) snapshotConfig() *config.Config {
	if c.cfg == nil {
		return nil
	}

	cfgCopy := *c.cfg

	services := make([]config.ServiceConfig, 0, len(c.reg.All()))
	for _, svc := range c.reg.All() {
		services = append(services, svc.Config)
	}
	cfgCopy.Services = services

	return &cfgCopy
}

func (c *Conslee) saveConfig() error {
	if c.configPath == "" {
		return nil
	}

	c.configMu.Lock()
	defer c.configMu.Unlock()

	cfg := c.snapshotConfig()
	if cfg == nil {
		return fmt.Errorf("no config to save")
	}

	return config.Save(c.configPath, cfg)
}

// Server management

func (c *Conslee) SetServer(srv *http.Server) {
	c.serverMu.Lock()
	defer c.serverMu.Unlock()
	c.server = srv
}

func (c *Conslee) RequestRestart() error {
	c.serverMu.Lock()
	defer c.serverMu.Unlock()

	if c.server == nil {
		return fmt.Errorf("server not set")
	}

	proc, err := os.FindProcess(os.Getpid())
	if err != nil {
		return fmt.Errorf("find process: %w", err)
	}

	return proc.Signal(syscall.SIGHUP)
}
