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
	"sync/atomic"
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

	logStartup(cfg)
	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			logJSON("fatal", "server failed", map[string]interface{}{
				"error": err.Error(),
			})
			os.Exit(1)
		}
	}()

	heartbeatCtx, stopHeartbeat := context.WithCancel(context.Background())
	heartbeatStopped := gateway.startHeartbeat(heartbeatCtx)
	metricsCtx, stopMetrics := context.WithCancel(context.Background())
	gateway.startMetricsEMF(metricsCtx)

	sig := <-shutdown
	logJSON("info", "shutdown signal received", map[string]interface{}{
		"signal": sig.String(),
	})

	clean := gateway.drain(server)
	stopMetrics()
	stopHeartbeat()
	select {
	case <-heartbeatStopped:
	case <-time.After(time.Second):
	}

	logJSON("info", "gateway stopped", map[string]interface{}{
		"clean": clean,
	})
	if !clean {
		os.Exit(1)
	}
}

// usageFlushTimeout is how long usage reports still sending get once every
// request has finished.
const usageFlushTimeout = 5 * time.Second

// drain takes this replica out of service and finishes the work it holds.
// Readiness fails at once while requests are still served for ShutdownDelay,
// which is the load balancer's time to notice. Then the listener closes and
// requests in flight, streams included, get DrainTimeout to finish; any still
// open after that are cut. Last, the usage reports of every finished request
// get usageFlushTimeout to land, so a scale-in loses no metering.
//
// It reports whether everything finished in time.
func (g *Gateway) drain(server *http.Server) bool {
	g.draining.Store(true)
	// Responses from here on carry Connection: close, so a client on a
	// keep-alive connection to this replica opens its next one through the
	// load balancer, to a replica that is staying.
	server.SetKeepAlivesEnabled(false)
	logJSON("info", "draining", map[string]interface{}{
		"shutdown_delay": g.cfg.ShutdownDelay.String(),
		"drain_timeout":  g.cfg.DrainTimeout.String(),
		"in_flight":      atomic.LoadInt64(&metricActiveConnections),
	})
	time.Sleep(g.cfg.ShutdownDelay)

	clean := true
	ctx, cancel := context.WithTimeout(context.Background(), g.cfg.DrainTimeout)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		logJSON("error", "requests still in flight at the drain timeout, closing them", map[string]interface{}{
			"error":     err.Error(),
			"in_flight": atomic.LoadInt64(&metricActiveConnections),
		})
		server.Close()
		clean = false
	}

	flushCtx, cancelFlush := context.WithTimeout(context.Background(), usageFlushTimeout)
	defer cancelFlush()
	if !drainUsageReports(flushCtx) {
		logJSON("error", "usage reports still pending at shutdown", nil)
		clean = false
	}
	return clean
}

// logStartup records how the gateway is configured, and what about that
// configuration an operator should change.
func logStartup(cfg *Config) {
	credentialSource := "none"
	switch {
	case cfg.GatewayCredentialFile != "":
		credentialSource = "file"
	case cfg.GatewayCredential != "":
		credentialSource = "env"
	}

	logJSON("info", "gateway starting", map[string]interface{}{
		"version":                   version,
		"port":                      cfg.Port,
		"zentinelle":                cfg.ZentinelleURL,
		"fail_open":                 cfg.FailOpen,
		"providers":                 cfg.ProviderKeys(),
		"policy_timeout":            cfg.PolicyTimeout.String(),
		"tenant_provider_keys":      cfg.GatewayCredential != "",
		"gateway_credential_source": credentialSource,
		"env_provider_keys":         cfg.AllowEnvProviderKeys,
	})

	switch {
	case cfg.AllowEnvProviderKeys:
		logJSON("warn", "ALLOW_ENV_PROVIDER_KEYS is deprecated and will be removed in a future release: "+
			"store provider keys per tenant in Zentinelle (Settings > LLM providers) instead", map[string]interface{}{
			"providers": cfg.ProviderKeys(),
		})
	case len(cfg.ProviderAPIKeys) > 0:
		logJSON("warn", "provider keys in the environment are ignored: store them per tenant in Zentinelle (Settings > LLM providers)", map[string]interface{}{
			"providers": cfg.ProviderKeys(),
		})
	}
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
