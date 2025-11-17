package proxy

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"time"
)

// Health checks

func waitTCP(ctx context.Context, hostPort string, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for {
		d, err := net.DialTimeout("tcp", hostPort, 2*time.Second)
		if err == nil {
			_ = d.Close()
			return nil
		}
		if time.Now().After(deadline) {
			return fmt.Errorf("backend %s not listening by %s: %w", hostPort, timeout, err)
		}
		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled waiting TCP %s: %w", hostPort, ctx.Err())
		case <-time.After(1 * time.Second):
		}
	}
}

func waitHTTP(ctx context.Context, u *url.URL, path string, timeout time.Duration) error {
	if path == "" {
		return nil
	}
	hu := *u
	hu.Path = path

	client := &http.Client{
		Transport: &http.Transport{
			Proxy:           http.ProxyFromEnvironment,
			TLSClientConfig: &tls.Config{InsecureSkipVerify: true},
		},
		Timeout: 10 * time.Second,
	}

	deadline := time.Now().Add(timeout)

	for {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, hu.String(), nil)
		if err != nil {
			return fmt.Errorf("create healthcheck request: %w", err)
		}

		resp, err := client.Do(req)
		if err == nil {
			_ = resp.Body.Close()
			if resp.StatusCode >= 200 && resp.StatusCode < 500 {
				return nil
			}
		}

		if time.Now().After(deadline) {
			if err != nil {
				return fmt.Errorf("backend %s not healthy by %s: last error: %w", hu.String(), timeout, err)
			}
			return fmt.Errorf("backend %s not healthy by %s: last status %d", hu.String(), timeout, resp.StatusCode)
		}

		select {
		case <-ctx.Done():
			return fmt.Errorf("context cancelled during healthcheck %s: %w", hu.String(), ctx.Err())
		case <-time.After(1 * time.Second):
		}
	}
}
