package proxy

import (
	"strings"
	"sync"
)

// Service registry

type ServiceRegistry struct {
	mu     sync.RWMutex
	byHost map[string]*ServiceState
	byName map[string]*ServiceState
}

func NewRegistry() *ServiceRegistry {
	return &ServiceRegistry{
		byHost: map[string]*ServiceState{},
		byName: map[string]*ServiceState{},
	}
}

func (r *ServiceRegistry) Add(host string, s *ServiceState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if host != "" {
		r.byHost[host] = s
	}
	r.byName[s.Config.Name] = s
}

func (r *ServiceRegistry) UpdateHost(s *ServiceState, newHost string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s.Config.Host != "" {
		delete(r.byHost, s.Config.Host)
	}
	s.Config.Host = newHost
	if newHost != "" {
		r.byHost[newHost] = s
	}
}

func (r *ServiceRegistry) DelByName(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s, ok := r.byName[name]; ok {
		delete(r.byHost, s.Config.Host)
		delete(r.byName, name)
	}
}

func (r *ServiceRegistry) GetByHost(host string) (*ServiceState, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.byHost[host]
	return s, ok
}

func (r *ServiceRegistry) GetByName(name string) (*ServiceState, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	s, ok := r.byName[name]
	return s, ok
}

func (r *ServiceRegistry) All() []*ServiceState {
	r.mu.RLock()
	defer r.mu.RUnlock()
	out := make([]*ServiceState, 0, len(r.byName))
	for _, s := range r.byName {
		out = append(out, s)
	}
	return out
}

func (r *ServiceRegistry) FindContainerConflict(containers []string, excludeService string) (svcName, containerName string) {
	if len(containers) == 0 {
		return "", ""
	}
	set := map[string]struct{}{}
	for _, n := range containers {
		n = strings.TrimSpace(n)
		if n != "" {
			set[n] = struct{}{}
		}
	}

	for _, svc := range r.All() {
		if svc.Config.Name == excludeService {
			continue
		}
		for _, ex := range svc.Config.Containers {
			if _, ok := set[ex]; ok {
				return svc.Config.Name, ex
			}
		}
		if svc.Config.ContainerName != "" {
			if _, ok := set[svc.Config.ContainerName]; ok {
				return svc.Config.Name, svc.Config.ContainerName
			}
		}
	}
	return "", ""
}
