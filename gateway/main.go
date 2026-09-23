package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"
)

func main() {
	cfg, err := LoadConfig()
	if err != nil {
		logJSON("fatal", "invalid configuration", map[string]interface{}{
			"error": err.Error(),
		})
		os.Exit(1)
	}

	gateway := NewGateway(cfg)
	server := &http.Server{
		Addr:         ":" + cfg.Port,
		Handler:      gateway,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0, // No write timeout — streaming responses can take minutes
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown on SIGTERM/SIGINT
	shutdown := make(chan os.Signal, 1)
	signal.Notify(shutdown, syscall.SIGTERM, syscall.SIGINT)

	go func() {
		logJSON("info", "gateway starting", map[string]interface{}{
			"port":                 cfg.Port,
			"zentinelle":           cfg.ZentinelleURL,
			"fail_open":            cfg.FailOpen,
			"providers":            cfg.ProviderKeys(),
			"policy_timeout":       cfg.PolicyTimeout.String(),
			"tenant_provider_keys": cfg.GatewayToken != "",
			"env_provider_keys":    cfg.AllowEnvProviderKeys,
		})
		if len(cfg.ProviderAPIKeys) > 0 && !cfg.AllowEnvProviderKeys {
			logJSON("warn", "provider keys in the environment are ignored without ALLOW_ENV_PROVIDER_KEYS=true", map[string]interface{}{
				"providers": cfg.ProviderKeys(),
			})
		}

		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logJSON("fatal", "server failed", map[string]interface{}{
				"error": err.Error(),
			})
			os.Exit(1)
		}
	}()

	sig := <-shutdown
	logJSON("info", "shutdown signal received", map[string]interface{}{
		"signal": sig.String(),
	})

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		logJSON("error", "shutdown error", map[string]interface{}{
			"error": err.Error(),
		})
		os.Exit(1)
	}

	logJSON("info", "gateway stopped", nil)
}

// logOutput is where log lines go: stderr, swapped only by tests that need to
// read what was logged. Writes hold the lock, so a swap never races a line
// being written from a background goroutine.
var logOutput = struct {
	sync.Mutex
	w io.Writer
}{w: os.Stderr}

// logJSON writes a structured JSON log entry to stderr.
func logJSON(level string, msg string, fields map[string]interface{}) {
	entry := map[string]interface{}{
		"ts":    time.Now().UTC().Format(time.RFC3339Nano),
		"level": level,
		"msg":   msg,
	}
	for k, v := range fields {
		entry[k] = v
	}

	// Format provider lists as comma-separated strings for readability
	if providers, ok := entry["providers"].([]string); ok {
		entry["providers"] = strings.Join(providers, ",")
	}

	line, err := json.Marshal(entry)

	logOutput.Lock()
	defer logOutput.Unlock()
	if err != nil {
		fmt.Fprintf(logOutput.w, `{"ts":"%s","level":"error","msg":"log marshal failed: %v"}`+"\n",
			time.Now().UTC().Format(time.RFC3339Nano), err)
		return
	}
	fmt.Fprintln(logOutput.w, string(line))
}
