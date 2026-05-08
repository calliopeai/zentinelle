package main

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// Gateway is the main HTTP handler that proxies requests to LLM providers
// with Zentinelle policy enforcement.
type Gateway struct {
	cfg    *Config
	client *http.Client
}

// NewGateway creates a new Gateway with the given configuration.
func NewGateway(cfg *Config) *Gateway {
	return &Gateway{
		cfg: cfg,
		client: &http.Client{
			// No global timeout — streaming responses can take minutes.
			// Per-request timeouts are handled by context.
			Timeout: 0,
			// Don't follow redirects from providers
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				return http.ErrUseLastResponse
			},
		},
	}
}

// ServeHTTP dispatches incoming requests to the appropriate handler.
func (g *Gateway) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/health" {
		g.handleHealth(w, r)
		return
	}

	g.handleProxy(w, r)
}

func (g *Gateway) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "GET only")
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"providers": g.cfg.ProviderKeys(),
	})
}

func (g *Gateway) handleProxy(w http.ResponseWriter, r *http.Request) {
	start := time.Now()
	requestID := generateRequestID()

	// Always set request ID on response
	w.Header().Set("X-Request-ID", requestID)

	// 1. Extract Zentinelle key
	agentKey := r.Header.Get("X-Zentinelle-Key")
	if agentKey == "" {
		logJSON("warn", "missing zentinelle key", map[string]interface{}{
			"request_id": requestID,
			"path":       r.URL.Path,
			"remote":     r.RemoteAddr,
		})
		writeJSONError(w, http.StatusUnauthorized, "missing_key", "X-Zentinelle-Key header is required")
		return
	}

	// 2. Detect provider from path
	provider, upstreamPath, ok := DetectProvider(r.URL.Path)
	if !ok {
		logJSON("warn", "unknown route", map[string]interface{}{
			"request_id": requestID,
			"path":       r.URL.Path,
		})
		writeJSONError(w, http.StatusNotFound, "unknown_route", fmt.Sprintf("no provider matches path %s", r.URL.Path))
		return
	}

	// 3. Read request body
	var body []byte
	var err error
	if r.Body != nil {
		body, err = io.ReadAll(io.LimitReader(r.Body, g.cfg.MaxResponseBytes))
		if err != nil {
			logJSON("error", "failed to read request body", map[string]interface{}{
				"request_id": requestID,
				"error":      err.Error(),
			})
			writeJSONError(w, http.StatusBadRequest, "body_read_error", "failed to read request body")
			return
		}
	}

	// 4. Extract model name from request body for policy context
	model := extractModel(body, provider.Name)

	// 5. Policy check
	policyResult := CheckPolicy(r.Context(), g.cfg, agentKey, provider.Name, model)

	logJSON("info", "policy check completed", map[string]interface{}{
		"request_id": requestID,
		"provider":   provider.Name,
		"model":      model,
		"allowed":    policyResult.Allowed,
		"reason":     policyResult.Reason,
	})

	if !policyResult.Allowed {
		logJSON("warn", "request denied by policy", map[string]interface{}{
			"request_id": requestID,
			"provider":   provider.Name,
			"model":      model,
			"reason":     policyResult.Reason,
		})
		writeJSONError(w, http.StatusForbidden, "policy_denied", policyResult.Reason)
		return
	}

	// 6. Look up provider API key
	apiKey := g.cfg.KeyForProvider(provider.Name)
	if apiKey == "" {
		logJSON("error", "no api key configured for provider", map[string]interface{}{
			"request_id": requestID,
			"provider":   provider.Name,
		})
		writeJSONError(w, http.StatusServiceUnavailable, "no_api_key", fmt.Sprintf("no API key configured for provider %s", provider.Name))
		return
	}

	// 7. Build upstream URL
	upstreamURL := provider.BaseURL + upstreamPath
	if r.URL.RawQuery != "" {
		upstreamURL += "?" + r.URL.RawQuery
	}

	// 8. Build upstream request
	upstreamReq, err := http.NewRequestWithContext(r.Context(), r.Method, upstreamURL, nil)
	if err != nil {
		logJSON("error", "failed to create upstream request", map[string]interface{}{
			"request_id": requestID,
			"error":      err.Error(),
		})
		writeJSONError(w, http.StatusInternalServerError, "upstream_request_error", "failed to build upstream request")
		return
	}

	// Set body on the upstream request
	if len(body) > 0 {
		upstreamReq.Body = io.NopCloser(strings.NewReader(string(body)))
		upstreamReq.ContentLength = int64(len(body))
	}

	// Copy headers, stripping hop-by-hop and zentinelle-specific ones
	for key, vals := range r.Header {
		if ShouldForwardHeader(key) {
			for _, val := range vals {
				upstreamReq.Header.Add(key, val)
			}
		}
	}

	// Inject provider auth
	upstreamReq.Header.Set(provider.AuthHeader, provider.AuthPrefix+apiKey)

	// Set Host header to upstream hostname
	parsed, _ := url.Parse(provider.BaseURL)
	if parsed != nil {
		upstreamReq.Host = parsed.Host
	}

	// Forward request ID
	upstreamReq.Header.Set("X-Request-ID", requestID)

	// 9. Forward request
	streaming := isStreamingRequest(body, r.Header.Get("Accept"))

	logJSON("info", "forwarding request", map[string]interface{}{
		"request_id": requestID,
		"provider":   provider.Name,
		"model":      model,
		"method":     r.Method,
		"upstream":   upstreamURL,
		"streaming":  streaming,
	})

	upstreamResp, err := g.client.Do(upstreamReq)
	if err != nil {
		logJSON("error", "upstream request failed", map[string]interface{}{
			"request_id": requestID,
			"provider":   provider.Name,
			"error":      err.Error(),
		})
		writeJSONError(w, http.StatusBadGateway, "upstream_error", fmt.Sprintf("upstream request failed: %v", err))
		return
	}
	defer upstreamResp.Body.Close()

	// 10. Stream or copy response
	var respBody []byte
	if streaming || isStreamingResponse(upstreamResp.Header.Get("Content-Type")) {
		respBody, err = streamResponse(w, upstreamResp, g.cfg.MaxResponseBytes)
	} else {
		respBody, err = copyResponse(w, upstreamResp, g.cfg.MaxResponseBytes)
	}

	latencyMs := time.Since(start).Milliseconds()

	if err != nil {
		if _, ok := err.(*responseTooLargeError); ok {
			logJSON("error", "response too large", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"limit":      g.cfg.MaxResponseBytes,
			})
			// Response already partially written — can't change status code.
			// Log and move on.
		} else {
			logJSON("error", "response forwarding failed", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"error":      err.Error(),
			})
		}
	}

	logJSON("info", "request completed", map[string]interface{}{
		"request_id":      requestID,
		"provider":        provider.Name,
		"model":           model,
		"upstream_status": upstreamResp.StatusCode,
		"latency_ms":      latencyMs,
	})

	// 11. Async usage reporting
	if len(respBody) > 0 {
		usage := ExtractUsage(respBody, provider.Name)
		if usage.PromptTokens > 0 || usage.CompletionTokens > 0 {
			ReportUsage(g.cfg, agentKey, provider.Name, model, usage, latencyMs, requestID)
		}
	}
}

// extractModel pulls the model name from the request body.
func extractModel(body []byte, providerName string) string {
	if len(body) == 0 {
		return ""
	}

	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return ""
	}

	if model, ok := parsed["model"].(string); ok {
		return model
	}

	return ""
}

// generateRequestID creates a random UUID-like request identifier.
func generateRequestID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		// Fallback to timestamp-based ID if crypto/rand fails
		return fmt.Sprintf("req_%d", time.Now().UnixNano())
	}
	// Format as UUID v4
	b[6] = (b[6] & 0x0f) | 0x40
	b[8] = (b[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

// writeJSONError sends a JSON error response to the client.
func writeJSONError(w http.ResponseWriter, status int, code string, detail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(map[string]string{
		"error":  code,
		"detail": detail,
	})
}
