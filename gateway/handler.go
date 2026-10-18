package main

import (
	"crypto/rand"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// Gateway is the main HTTP handler that proxies requests to LLM providers
// with Zentinelle policy enforcement.
type Gateway struct {
	cfg        *Config
	client     *http.Client
	keys       *providerKeyCache
	credential *gatewayCredential
	stats      *gatewayStats

	// draining is set on SIGTERM: /ready fails from then on, so the load
	// balancer stops sending this replica new requests while it finishes
	// the ones it has.
	draining atomic.Bool
}

// NewGateway creates a new Gateway with the given configuration.
func NewGateway(cfg *Config) *Gateway {
	return &Gateway{
		cfg:        cfg,
		keys:       newProviderKeyCache(providerKeyCacheTTL, providerKeyCacheMaxEntries),
		credential: newGatewayCredential(cfg.GatewayCredential, cfg.GatewayCredentialFile),
		stats:      newGatewayStats(maxAgentsSeen),
		client: &http.Client{
			// No global timeout — streaming responses can take minutes.
			// Per-request timeouts are handled by context.
			Timeout: 0,
			// Pooled, because the default transport keeps two idle
			// connections per host and this one proxies every request.
			Transport: providerTransport,
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
	if r.URL.Path == "/ready" {
		g.handleReady(w, r)
		return
	}
	if r.URL.Path == "/metrics" {
		handleMetrics(w, r)
		return
	}
	if g.isControlPlaneRoute(r) {
		g.handlePassthrough(w, r)
		return
	}

	// Counted around the proxy only: /health and /metrics are the scraper's
	// own traffic, and a gauge that included them would never read zero.
	atomic.AddInt64(&metricActiveConnections, 1)
	defer atomic.AddInt64(&metricActiveConnections, -1)
	g.stats.requests.Add(1)

	g.handleProxy(w, r)
}

func (g *Gateway) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "GET only")
		return
	}

	// Env keys the gateway will actually use. Without the fallback they are
	// ignored, and listing them would say otherwise.
	envProviders := []string{}
	if g.cfg.AllowEnvProviderKeys {
		envProviders = g.cfg.ProviderKeys()
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":    "ok",
		"providers": envProviders,
	})
}

// handleReady is the readiness check: 503 once the replica is draining.
// /health stays 200 meanwhile, since a draining replica is not a dead one
// and restarting it would cut the requests it is finishing.
func (g *Gateway) handleReady(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "GET only")
		return
	}
	status, code := "ready", http.StatusOK
	if g.draining.Load() {
		status, code = "draining", http.StatusServiceUnavailable
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	json.NewEncoder(w).Encode(map[string]string{"status": status})
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
	// Gemini names the model in the path, and the policy check reads it from
	// there. A dot segment would let the path the policy sees name one model
	// (models/cheap/../expensive) while the provider, normalising it, serves
	// another, so the path is resolved here, before the route check, and the
	// resolved one is forwarded.
	if provider.Name == "google" {
		upstreamPath = path.Clean(upstreamPath)
	}
	if !IsInferenceRoute(provider, r.Method, upstreamPath) {
		logJSON("warn", "path not allowed", map[string]interface{}{
			"request_id": requestID,
			"provider":   provider.Name,
			"method":     r.Method,
			"path":       r.URL.Path,
		})
		writeJSONError(w, http.StatusForbidden, "path_not_allowed",
			fmt.Sprintf("only %s inference requests are proxied", provider.Name))
		return
	}

	// 3. Read request body
	maxRequestBytes := g.cfg.MaxResponseBytes
	if maxRequestBytes <= 0 {
		maxRequestBytes = 52428800
	}
	var body []byte
	var err error
	if r.Body != nil {
		body, err = io.ReadAll(io.LimitReader(r.Body, maxRequestBytes+1))
		if err != nil {
			logJSON("error", "failed to read request body", map[string]interface{}{
				"request_id": requestID,
				"error":      err.Error(),
			})
			writeJSONError(w, http.StatusBadRequest, "body_read_error", "failed to read request body")
			return
		}
	}

	if int64(len(body)) > maxRequestBytes {
		writeJSONError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request exceeds configured limit")
		return
	}

	// The policy check reads the body as text. A compressed body would reach
	// the provider with its content unread by every input filter.
	// Every value is checked: the header is forwarded as sent, so a second
	// Content-Encoding line after an "identity" one would reach the provider.
	for _, enc := range r.Header.Values("Content-Encoding") {
		if enc = strings.TrimSpace(enc); enc != "" && !strings.EqualFold(enc, "identity") {
			writeJSONError(w, http.StatusUnsupportedMediaType, "unsupported_content_encoding",
				"compressed request bodies cannot be inspected; send the body uncompressed")
			return
		}
	}

	// 4. Extract model name for policy context
	model := extractModel(body, provider.Name, upstreamPath)

	// 5. Policy check
	policyStart := time.Now()
	policyResult := CheckPolicy(r.Context(), g.cfg, agentKey, provider.Name, model, map[string]interface{}{"input_text": string(body), "request_id": requestID, "request_body": string(body)})
	metricPolicyCheckDuration.observe("", time.Since(policyStart).Seconds())
	g.stats.policyChecked(r.Context(), agentKey, policyResult)

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
		metricPolicyDenied.inc(labels("provider", provider.Name))
		g.stats.blocked.Add(1)
		writeJSONError(w, http.StatusForbidden, "policy_denied", policyResult.Reason)
		return
	}

	// 6. Resolve the provider key: the tenant's stored key, or the gateway's
	// own where that fallback is allowed. Never the client's (#380).
	apiKey, keySource, keyErr := g.resolveProviderKey(r.Context(), agentKey, provider.Name)
	if keyErr != nil {
		fields := map[string]interface{}{
			"request_id": requestID,
			"provider":   provider.Name,
			"error":      keyErr.code,
		}
		if keyErr.cause != nil {
			fields["cause"] = keyErr.cause.Error()
		}
		logJSON("error", "no provider key for request", fields)
		writeJSONError(w, keyErr.status, keyErr.code, keyErr.detail)
		return
	}

	// 7. Build upstream URL
	upstreamURL := provider.BaseURL + upstreamPath
	if query := withoutKeyParam(r.URL.RawQuery); query != "" {
		upstreamURL += "?" + query
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

	// Copy headers, stripping hop-by-hop, zentinelle-specific and client
	// credential ones
	for key, vals := range r.Header {
		if ShouldForwardHeader(key) {
			for _, val := range vals {
				upstreamReq.Header.Add(key, val)
			}
		}
	}

	// Ask for an uncompressed response, whatever the client accepts. The
	// gateway reads every response to meter it and, where a filter applies,
	// to inspect it; a gzip body read as text meters nothing and hides its
	// content from the filter. SDKs send Accept-Encoding: gzip by default.
	upstreamReq.Header.Set("Accept-Encoding", "identity")

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
	upstreamStart := time.Now()
	streaming := isStreamingRequest(body, r.Header.Get("Accept"))

	logJSON("info", "forwarding request", map[string]interface{}{
		"request_id": requestID,
		"provider":   provider.Name,
		"model":      model,
		"method":     r.Method,
		"upstream":   upstreamURL,
		"streaming":  streaming,
		"key_source": keySource,
	})

	upstreamResp, err := g.client.Do(upstreamReq)
	if err != nil {
		logJSON("error", "upstream request failed", map[string]interface{}{
			"request_id": requestID,
			"provider":   provider.Name,
			"error":      err.Error(),
		})
		metricUpstreamErrors.inc(labels("provider", provider.Name, "error_type", "request_failed"))
		writeJSONError(w, http.StatusBadGateway, "upstream_error", fmt.Sprintf("upstream request failed: %v", err))
		return
	}
	metricUpstreamDuration.observe(labels("provider", provider.Name), time.Since(upstreamStart).Seconds())
	defer upstreamResp.Body.Close()

	// 10. Stream or copy response
	//
	// Unless an output filter applies, in which case nothing may reach the
	// client until the filter has seen the whole thing. Buffering costs a
	// streamed response its incrementality, so it is paid only where a filter
	// actually exists — which is why the request-time check reports it.
	var respBody []byte
	isStream := streaming || isStreamingResponse(upstreamResp.Header.Get("Content-Type"))
	contentEncoding := upstreamResp.Header.Get("Content-Encoding")

	// meter reports what the provider billed for this call. It runs on every
	// path that got a response, including the ones that never deliver it: a
	// withheld, uninspectable, abandoned or oversize response was still paid
	// for. The body may be partial; whatever usage it carries is counted.
	meter := func(decoded []byte, outcome string) UsageData {
		usage := ExtractUsage(decoded, provider.Name)
		ReportUsage(g.cfg, agentKey, g.credential.current(), provider.Name, model, usage,
			time.Since(start).Milliseconds(), requestID, upstreamResp.StatusCode, outcome)
		return usage
	}

	if policyResult.OutputFilterRequired {
		respBody, err = bufferResponse(upstreamResp, g.cfg.MaxResponseBytes)
		var inspected []byte
		if err == nil {
			inspected, err = decodeBody(contentEncoding, respBody, g.cfg.MaxResponseBytes)
		}
		if err != nil {
			logJSON("warn", "response could not be inspected", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"error":      err.Error(),
			})
			partial, _ := decodeBody(contentEncoding, respBody, g.cfg.MaxResponseBytes)
			meter(partial, outcomeInspectionFailed)
			writeJSONError(w, http.StatusBadGateway, "inspection_failed", "response could not be inspected")
			return
		}

		output := string(inspected)
		if isStream {
			output = sseText(inspected)
		}

		outcome := CheckOutputPolicy(r.Context(), g.cfg, agentKey, provider.Name, model, output)
		if !outcome.Allowed {
			logJSON("warn", "response withheld by output filter", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"model":      model,
				"reason":     outcome.Reason,
			})
			// Nothing has been written yet, so this is a clean refusal
			// rather than a truncated answer.
			g.stats.blocked.Add(1)
			meter(inspected, outcomeOutputFiltered)
			writeJSONError(w, http.StatusForbidden, "output_filtered", outcome.Reason)
			return
		}

		err = deliverBuffered(w, upstreamResp, respBody)
	} else if isStream {
		respBody, err = streamResponse(w, upstreamResp, g.cfg.MaxResponseBytes)
	} else {
		respBody, err = copyResponse(w, upstreamResp, g.cfg.MaxResponseBytes)
	}

	latencyMs := time.Since(start).Milliseconds()

	outcome := outcomeCompleted
	if err != nil {
		var clientErr *clientWriteError
		switch {
		case errors.As(err, new(*responseTooLargeError)):
			outcome = outcomeResponseTooLarge
			logJSON("error", "response too large", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"limit":      g.cfg.MaxResponseBytes,
			})
			// Response already partially written — can't change status code.
			// Log and move on.
		case errors.As(err, &clientErr) || r.Context().Err() != nil:
			outcome = outcomeClientDisconnected
			logJSON("warn", "client went away before the response completed", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"error":      err.Error(),
			})
		default:
			outcome = outcomeUpstreamReadFailed
			logJSON("error", "response forwarding failed", map[string]interface{}{
				"request_id": requestID,
				"provider":   provider.Name,
				"error":      err.Error(),
			})
		}
	}

	metricRequests.inc(labels(
		"provider", provider.Name,
		"model", model,
		"status_code", strconv.Itoa(upstreamResp.StatusCode),
	))
	metricRequestDuration.observe(labels("provider", provider.Name), float64(latencyMs)/1000)

	logJSON("info", "request completed", map[string]interface{}{
		"request_id":      requestID,
		"provider":        provider.Name,
		"model":           model,
		"upstream_status": upstreamResp.StatusCode,
		"latency_ms":      latencyMs,
		"outcome":         outcome,
	})

	// 11. Async usage reporting, and the interaction itself
	decoded, _ := decodeBody(contentEncoding, respBody, g.cfg.MaxResponseBytes)
	usage := meter(decoded, outcome)
	if len(respBody) > 0 {
		// Reuses the bodies already in hand — the request was read to extract
		// the model, the response to extract usage — so a trace costs no extra
		// buffering.
		LogInteraction(g.cfg, agentKey, provider.Name, model,
			body, decoded, isStream, usage, latencyMs, requestID)
	}
}

// extractModel pulls the model name from the request.
//
// Gemini names the model in the path (/v1beta/models/gemini-2.5-pro:
// generateContent) and never in the body, so for Google the path is the
// authority. Reading only the body left every Gemini call with no model, and
// so with no pricing, no model policy and no hard budget that could pass.
func extractModel(body []byte, providerName string, upstreamPath string) string {
	if providerName == "google" {
		if _, rest, ok := strings.Cut(upstreamPath, "/models/"); ok {
			if end := strings.IndexAny(rest, ":/"); end >= 0 {
				rest = rest[:end]
			}
			if rest != "" {
				return rest
			}
		}
	}

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
