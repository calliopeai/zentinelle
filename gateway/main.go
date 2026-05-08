package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
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
			"port":          cfg.Port,
			"zentinelle":    cfg.ZentinelleURL,
			"fail_open":     cfg.FailOpen,
			"providers":     cfg.ProviderKeys(),
			"policy_timeout": cfg.PolicyTimeout.String(),
		})

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
	if err != nil {
		fmt.Fprintf(os.Stderr, `{"ts":"%s","level":"error","msg":"log marshal failed: %v"}`+"\n",
			time.Now().UTC().Format(time.RFC3339Nano), err)
		return
	}
	fmt.Fprintln(os.Stderr, string(line))
}
