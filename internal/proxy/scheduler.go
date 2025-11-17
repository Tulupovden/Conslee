package proxy

import (
	"context"
	"log"
	"time"
)

// Scheduler

func (c *Conslee) StartIdleReaper(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		for {
			select {
			case <-ticker.C:
				c.reapIdle(ctx)
				c.runSchedule(ctx)
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

func (c *Conslee) reapIdle(ctx context.Context) {
	now := time.Now()
	for _, svc := range c.reg.All() {
		if svc.Config.Disabled {
			continue
		}
		if svc.Config.IdleTimeout <= 0 {
			continue
		}
		idle := now.Sub(svc.LastActivity)
		if idle < svc.Config.IdleTimeout {
			continue
		}

		names := append([]string(nil), svc.Config.Containers...)
		if len(names) == 0 && svc.Config.ContainerName != "" {
			names = []string{svc.Config.ContainerName}
		}

		for _, name := range names {
			st, err := c.rt.Inspect(ctx, name)
			if err != nil {
				log.Printf("inspect %s in reapIdle: %v", name, err)
				continue
			}
			if !st.Running {
				continue
			}
			log.Printf("stopping container %s for service %s (idle %v > %v)", name, svc.Config.Name, idle, svc.Config.IdleTimeout)
			if err := c.rt.Stop(ctx, name, 0); err != nil {
				log.Printf("stop %s error: %v", name, err)
			}
		}
	}
}

func (c *Conslee) runSchedule(ctx context.Context) {
	now := time.Now()
	for _, svc := range c.reg.All() {
		if svc.Config.Disabled {
			continue
		}
		if svc.Schedule == nil {
			continue
		}
		if !svc.ShouldBeUp(now) {
			if svc.Schedule.Mode == ModeScheduleOnly {
				names := append([]string(nil), svc.Config.Containers...)
				if len(names) == 0 && svc.Config.ContainerName != "" {
					names = []string{svc.Config.ContainerName}
				}
				for _, name := range names {
					_ = c.rt.Stop(ctx, name, 0)
				}
			}
			continue
		}

		if svc.Schedule.Mode == ModeScheduleOnly || svc.Schedule.Mode == ModeBoth {
			s := svc
			go func() {
				if err := ensureRunning(ctx, c.rt, s); err != nil {
					log.Printf("scheduled start error for %s: %v", s.Config.Name, err)
				}
			}()
		}
	}
}
