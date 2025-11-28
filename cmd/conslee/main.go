package main

import (
	"context"
	"flag"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"conslee/internal/config"
	"conslee/internal/proxy"
)

var (
	serverInstance *http.Server
	serverMu       sync.Mutex
)

func main() {
	configPath := flag.String("config", "config/config.yml", "path to config file")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("failed to load config: %v", err)
	}

	p, err := proxy.New(cfg, *configPath)
	if err != nil {
		log.Fatalf("failed to init proxy: %v", err)
	}

	mux := http.NewServeMux()

	// API routes
	// /api/services
	mux.HandleFunc("/api/services", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			p.HandleListServices(w, r)
		case http.MethodPost:
			p.HandleCreateService(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// /api/services/... – start/stop/settings/delete
	mux.HandleFunc("/api/services/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path

		if strings.HasSuffix(path, "/start") && r.Method == http.MethodPost {
			p.HandleStartService(w, r)
			return
		}
		if strings.HasSuffix(path, "/stop") && r.Method == http.MethodPost {
			p.HandleStopService(w, r)
			return
		}
		if strings.HasSuffix(path, "/settings") && r.Method == http.MethodPost {
			p.HandleUpdateService(w, r)
			return
		}
		if r.Method == http.MethodDelete {
			p.HandleDeleteService(w, r)
			return
		}

		http.Error(w, "not found", http.StatusNotFound)
	})

	mux.HandleFunc("/api/docker/containers", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p.HandleListContainers(w, r)
	})

	// GET /api/system, POST /api/system
	mux.HandleFunc("/api/system", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			p.HandleGetSystem(w, r)
		case http.MethodPost:
			p.HandleUpdateSystem(w, r)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// GET /api/system/check-port
	mux.HandleFunc("/api/system/check-port", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p.HandleCheckPort(w, r)
	})

	mux.HandleFunc("/api/probes", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		p.HandleProbe(w, r)
	})

	// Static files
	mux.Handle("/ui/", http.StripPrefix("/ui/", http.FileServer(http.Dir("./ui/dist"))))

	// Reverse proxy
	mux.Handle("/", p)

	// Health check
	mux.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})

	// Server setup
	serverMu.Lock()
	serverInstance = &http.Server{
		Addr:         cfg.Server.ListenAddr,
		Handler:      mux,
		ReadTimeout:  60 * time.Second,
		WriteTimeout: 60 * time.Second,
	}
	serverMu.Unlock()

	p.SetServer(serverInstance)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM, syscall.SIGHUP)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go p.StartIdleReaper(ctx, cfg.IdleReaper.Interval)

	// Start server
	serverErr := make(chan error, 1)
	go func() {
		log.Printf("conslee listening on %s", cfg.Server.ListenAddr)
		serverMu.Lock()
		srv := serverInstance
		serverMu.Unlock()
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			serverErr <- err
		}
	}()

	// Signal handling
	var shouldRestart bool
	select {
	case sig := <-stop:
		if sig == syscall.SIGHUP {
			log.Println("restart requested (SIGHUP), shutting down gracefully...")
			shouldRestart = true
		} else {
			log.Printf("received signal: %v, shutting down...", sig)
		}
	case err := <-serverErr:
		log.Fatalf("http server error: %v", err)
	}

	shutdownCtx, shutdownCancel := context.WithTimeout(ctx, 10*time.Second)
	defer shutdownCancel()

	serverMu.Lock()
	srv := serverInstance
	serverMu.Unlock()

	// Graceful shutdown
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("HTTP shutdown error: %v", err)
	}

	if shouldRestart {
		log.Println("restarting server... (exiting for container restart)")
		os.Exit(0)
	}
}
