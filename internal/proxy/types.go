package proxy

import (
	"log"
	"net/url"
	"strconv"
	"strings"
	"time"

	"conslee/internal/config"
)

// Schedule types

type ScheduleMode string

const (
	ModeOnDemand     ScheduleMode = "on_demand"
	ModeScheduleOnly ScheduleMode = "schedule_only"
	ModeBoth         ScheduleMode = "both"
)

type ServiceSchedule struct {
	Mode         ScheduleMode
	Days         map[time.Weekday]bool
	StartMinutes int
	StopMinutes  int
}

func (s *ServiceSchedule) ModeString() string {
	switch s.Mode {
	case ModeScheduleOnly:
		return "schedule_only"
	case ModeBoth:
		return "both"
	default:
		return "on_demand"
	}
}

type ServiceState struct {
	Config       config.ServiceConfig
	Target       *url.URL
	LastActivity time.Time
	Schedule     *ServiceSchedule
}

// DTOs

type ServiceScheduleDTO struct {
	Mode  string   `json:"mode"`
	Days  []string `json:"days,omitempty"`
	Start string   `json:"start,omitempty"`
	Stop  string   `json:"stop,omitempty"`
}

type ServiceStatusDTO struct {
	Name           string              `json:"name"`
	Host           string              `json:"host"`
	Containers     []string            `json:"containers"`
	Mode           string              `json:"mode"`
	Enabled        bool                `json:"enabled"`
	Running        bool                `json:"running"`
	LastActivity   time.Time           `json:"lastActivity"`
	IdleTimeout    string              `json:"idleTimeout"`
	StartupTimeout string              `json:"startupTimeout"`
	TargetURL      string              `json:"targetUrl"`
	HealthPath     string              `json:"healthPath"`
	Schedule       *ServiceScheduleDTO `json:"schedule,omitempty"`
}

type SystemStatusDTO struct {
	ListenAddr         string `json:"listenAddr"`
	IdleReaperInterval string `json:"idleReaperInterval"`
}

type DockerPortDTO struct {
	IP      string `json:"ip"`
	Private uint16 `json:"private"`
	Public  uint16 `json:"public"`
	Type    string `json:"type"`
}

type DockerContainerDTO struct {
	ID     string          `json:"id"`
	Name   string          `json:"name"`
	Image  string          `json:"image"`
	State  string          `json:"state"`
	Status string          `json:"status"`
	Ports  []DockerPortDTO `json:"ports"`
	Stack  string          `json:"stack"`
}

// Schedule parsing

func parseHHMM(s string) int {
	if s == "" {
		return 0
	}
	parts := strings.Split(s, ":")
	if len(parts) != 2 {
		log.Printf("invalid time format %q, expected HH:MM", s)
		return 0
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		log.Printf("invalid time value %q, expected HH:MM", s)
		return 0
	}
	return h*60 + m
}

func ParseSchedule(sc *config.ScheduleConfig, mode string) *ServiceSchedule {
	if sc == nil {
		return nil
	}
	m := ServiceSchedule{
		Mode: ModeOnDemand,
		Days: map[time.Weekday]bool{},
	}

	switch mode {
	case "schedule_only":
		m.Mode = ModeScheduleOnly
	case "both":
		m.Mode = ModeBoth
	default:
		m.Mode = ModeOnDemand
	}

	for _, d := range sc.Days {
		switch strings.ToLower(d) {
		case "mon":
			m.Days[time.Monday] = true
		case "tue":
			m.Days[time.Tuesday] = true
		case "wed":
			m.Days[time.Wednesday] = true
		case "thu":
			m.Days[time.Thursday] = true
		case "fri":
			m.Days[time.Friday] = true
		case "sat":
			m.Days[time.Saturday] = true
		case "sun":
			m.Days[time.Sunday] = true
		}
	}

	m.StartMinutes = parseHHMM(sc.Start)
	m.StopMinutes = parseHHMM(sc.Stop)

	return &m
}

func (s *ServiceState) ShouldBeUp(now time.Time) bool {
	if s.Schedule == nil {
		return false
	}
	sch := s.Schedule

	if len(sch.Days) > 0 && !sch.Days[now.Weekday()] {
		return false
	}

	mins := now.Hour()*60 + now.Minute()

	if sch.StartMinutes == sch.StopMinutes {
		return true
	}
	if sch.StartMinutes < sch.StopMinutes {
		return mins >= sch.StartMinutes && mins < sch.StopMinutes
	}
	return mins >= sch.StartMinutes || mins < sch.StopMinutes
}
