package config

import (
	"bufio"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

// Config types

type ServerConfig struct {
	ListenAddr string `yaml:"listen_addr"`
}

type IdleReaperConfig struct {
	RawInterval string        `yaml:"interval"`
	Interval    time.Duration `yaml:"-"`
}

type ScheduleConfig struct {
	Days  []string `yaml:"days"`  // ["mon","tue",...,"sun"]
	Start string   `yaml:"start"` // "08:00"
	Stop  string   `yaml:"stop"`  // "23:00"
}

type ServiceConfig struct {
	Name string `yaml:"name"`
	Host string `yaml:"host"`

	ContainerName string   `yaml:"container_name"`
	Containers    []string `yaml:"containers"`

	TargetURL string `yaml:"target_url"`

	Mode     string          `yaml:"mode"` // "on_demand" | "schedule_only" | "both"
	Schedule *ScheduleConfig `yaml:"schedule"`

	Disabled bool `yaml:"disabled,omitempty"`

	RawIdleTimeout    string        `yaml:"idle_timeout"`
	IdleTimeout       time.Duration `yaml:"-"`
	RawStartupTimeout string        `yaml:"startup_timeout"`
	StartupTimeout    time.Duration `yaml:"-"`
	HealthPath        string        `yaml:"health_path"`
}

type Config struct {
	Server     ServerConfig     `yaml:"server"`
	IdleReaper IdleReaperConfig `yaml:"idle_reaper"`
	Services   []ServiceConfig  `yaml:"services"`
}

// Config loading and saving

func Load(path string) (*Config, error) {
	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			entries, err := os.ReadDir(path)
			if err != nil {
				return nil, fmt.Errorf("read directory at config path: %w", err)
			}
			if len(entries) > 0 {
				return nil, fmt.Errorf("config path exists as non-empty directory, cannot create file")
			}
			if err := os.Remove(path); err != nil {
				if err := os.RemoveAll(path); err != nil {
					return nil, fmt.Errorf("remove existing directory at config path: %w (directory may be a mount point)", err)
				}
			}
		}
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			cfg := defaultConfig()
			if saveErr := Save(path, cfg); saveErr != nil {
				return nil, fmt.Errorf("create default config: %w", saveErr)
			}
			return cfg, nil
		}
		return nil, fmt.Errorf("read config: %w", err)
	}

	var cfg Config
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("unmarshal yaml: %w", err)
	}

	if cfg.Server.ListenAddr == "" {
		cfg.Server.ListenAddr = ":8800"
	}

	if cfg.IdleReaper.RawInterval == "" {
		cfg.IdleReaper.RawInterval = "1m"
	}
	interval, err := time.ParseDuration(cfg.IdleReaper.RawInterval)
	if err != nil {
		return nil, fmt.Errorf("parse idle_reaper.interval: %w", err)
	}
	cfg.IdleReaper.Interval = interval

	for i := range cfg.Services {
		s := &cfg.Services[i]

		if len(s.Containers) == 0 && s.ContainerName != "" {
			s.Containers = []string{s.ContainerName}
		}

		if s.Mode == "" {
			s.Mode = "on_demand"
		}

		// idle_timeout
		if s.RawIdleTimeout == "" {
			s.RawIdleTimeout = "0s"
		}
		d, err := time.ParseDuration(s.RawIdleTimeout)
		if err != nil {
			return nil, fmt.Errorf("parse services[%d].idle_timeout: %w", i, err)
		}
		s.IdleTimeout = d

		// startup_timeout
		if s.RawStartupTimeout == "" {
			s.RawStartupTimeout = "30s"
		}
		sd, err := time.ParseDuration(s.RawStartupTimeout)
		if err != nil {
			return nil, fmt.Errorf("parse services[%d].startup_timeout: %w", i, err)
		}
		s.StartupTimeout = sd
	}

	return &cfg, nil
}

func defaultConfig() *Config {
	return &Config{
		Server: ServerConfig{
			ListenAddr: ":8800",
		},
		IdleReaper: IdleReaperConfig{
			RawInterval: "1m",
			Interval:    time.Minute,
		},
		Services: []ServiceConfig{},
	}
}

func Save(path string, cfg *Config) error {
	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}

	data = ensureServicesSeparated(data)

	if info, err := os.Stat(path); err == nil {
		if info.IsDir() {
			entries, err := os.ReadDir(path)
			if err != nil {
				return fmt.Errorf("read directory at config path: %w", err)
			}
			if len(entries) > 0 {
				return fmt.Errorf("config path exists as non-empty directory, cannot create file")
			}
			if err := os.Remove(path); err != nil {
				if err := os.RemoveAll(path); err != nil {
					return fmt.Errorf("cannot remove directory at config path: %w (directory may be a Docker mount point - please remove it manually on the host)", err)
				}
			}
		}
	}

	parentDir := filepath.Dir(path)
	if err := os.MkdirAll(parentDir, 0o755); err != nil {
		return fmt.Errorf("create parent directory: %w", err)
	}

	tmpFile := path + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0o644); err != nil {
		return fmt.Errorf("write temp config file: %w", err)
	}

	if info, err := os.Stat(path); err == nil && info.IsDir() {
		os.Remove(tmpFile)
		return fmt.Errorf("cannot create config file: path exists as directory (may have been recreated)")
	}

	// Atomic rename
	if err := os.Rename(tmpFile, path); err != nil {
		os.Remove(tmpFile) // Clean up
		return fmt.Errorf("rename config file: %w", err)
	}

	return nil
}

// YAML formatting

func ensureServicesSeparated(data []byte) []byte {
	scanner := bufio.NewScanner(bytes.NewReader(data))

	var buf bytes.Buffer
	inServices := false
	firstService := true
	servicesIndent := -1
	serviceItemIndent := -1

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		indent := countLeadingSpaces(line)

		if inServices && trimmed != "" && indent <= servicesIndent {
			inServices = false
		}

		if trimmed == "services:" {
			inServices = true
			firstService = true
			servicesIndent = indent
			serviceItemIndent = -1
		} else if inServices && strings.HasPrefix(trimmed, "- ") {
			if serviceItemIndent == -1 {
				serviceItemIndent = indent
			}
			if indent == serviceItemIndent {
				if firstService {
					firstService = false
				} else {
					buf.WriteByte('\n')
				}
			}
		}

		buf.WriteString(line)
		buf.WriteByte('\n')
	}

	if err := scanner.Err(); err != nil {
		return data
	}

	return buf.Bytes()
}

func countLeadingSpaces(s string) int {
	n := 0
	for _, ch := range s {
		if ch == ' ' {
			n++
		} else {
			break
		}
	}
	return n
}
