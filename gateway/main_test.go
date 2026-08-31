package main

import (
	"context"
	"encoding/json"
	"net"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"
)

// --- Config tests ---

func TestLoadConfigDefaults(t *testing.T) {
	// Clear env to test defaults
	for _, key := range []string{"GATEWAY_PORT", "ZENTINELLE_URL", "FAIL_OPEN", "POLICY_TIMEOUT_MS", "MAX_RESPONSE_BYTES"} {
		os.Unsetenv(key)
	}

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() returned error: %v", err)
	}

	if cfg.Port != "8742" {
		t.Errorf("Port = %q, want %q", cfg.Port, "8742")
	}
	if cfg.ZentinelleURL != "http://localhost:8080" {
		t.Errorf("ZentinelleURL = %q, want %q", cfg.ZentinelleURL, "http://localhost:8080")
	}
	if !cfg.FailOpen {
		t.Error("FailOpen should default to true")
	}
	if cfg.PolicyTimeout != 2000*time.Millisecond {
		t.Errorf("PolicyTimeout = %v, want %v", cfg.PolicyTimeout, 2000*time.Millisecond)
	}
	if cfg.MaxResponseBytes != 52428800 {
		t.Errorf("MaxResponseBytes = %d, want %d", cfg.MaxResponseBytes, 52428800)
	}
}

func TestLoadConfigFromEnv(t *testing.T) {
	os.Setenv("GATEWAY_PORT", "9000")
	os.Setenv("ZENTINELLE_URL", "http://zentinelle:8080/")
	os.Setenv("FAIL_OPEN", "false")
	os.Setenv("POLICY_TIMEOUT_MS", "500")
	os.Setenv("MAX_RESPONSE_BYTES", "1048576")
	os.Setenv("OPENAI_API_KEY", "sk-test-openai")
	os.Setenv("ANTHROPIC_API_KEY", "sk-ant-test")
	os.Setenv("GOOGLE_API_KEY", "AIza-test")
	defer func() {
		for _, key := range []string{"GATEWAY_PORT", "ZENTINELLE_URL", "FAIL_OPEN", "POLICY_TIMEOUT_MS",
			"MAX_RESPONSE_BYTES", "OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"} {
			os.Unsetenv(key)
		}
	}()

	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig() returned error: %v", err)
	}

	if cfg.Port != "9000" {
		t.Errorf("Port = %q, want %q", cfg.Port, "9000")
	}
	// Trailing slash should be trimmed
	if cfg.ZentinelleURL != "http://zentinelle:8080" {
		t.Errorf("ZentinelleURL = %q, want %q", cfg.ZentinelleURL, "http://zentinelle:8080")
	}
	if cfg.FailOpen {
		t.Error("FailOpen should be false")
	}
	if cfg.PolicyTimeout != 500*time.Millisecond {
		t.Errorf("PolicyTimeout = %v, want %v", cfg.PolicyTimeout, 500*time.Millisecond)
	}
	if cfg.MaxResponseBytes != 1048576 {
		t.Errorf("MaxResponseBytes = %d, want %d", cfg.MaxResponseBytes, 1048576)
	}

	keys := cfg.ProviderKeys()
	if len(keys) != 3 {
		t.Errorf("ProviderKeys() = %v, want 3 providers", keys)
	}
}

func TestLoadConfigInvalidFailOpen(t *testing.T) {
	os.Setenv("FAIL_OPEN", "not-a-bool")
	defer os.Unsetenv("FAIL_OPEN")

	_, err := LoadConfig()
	if err == nil {
		t.Error("LoadConfig() should return error for invalid FAIL_OPEN")
	}
}

func TestLoadConfigInvalidPolicyTimeout(t *testing.T) {
	os.Setenv("POLICY_TIMEOUT_MS", "abc")
	defer os.Unsetenv("POLICY_TIMEOUT_MS")

	_, err := LoadConfig()
	if err == nil {
		t.Error("LoadConfig() should return error for invalid POLICY_TIMEOUT_MS")
	}
}

func TestProviderKeyMapping(t *testing.T) {
	cfg := &Config{
		ProviderAPIKeys: map[string]string{"openai": "sk-openai", "anthropic": "sk-anthropic", "google": "goog-key"},
	}

	tests := []struct {
		provider string
		want     string
	}{
		{"openai", "sk-openai"},
		{"anthropic", "sk-anthropic"},
		{"google", "goog-key"},
		{"unknown", ""},
	}

	for _, tt := range tests {
		got := cfg.KeyForProvider(tt.provider)
		if got != tt.want {
			t.Errorf("KeyForProvider(%q) = %q, want %q", tt.provider, got, tt.want)
		}
	}
}

// --- Provider detection tests ---

func TestDetectProviderFromPath(t *testing.T) {
	tests := []struct {
		path         string
		wantProvider string
		wantPath     string
		wantOK       bool
	}{
		// OpenAI paths
		{"/v1/chat/completions", "openai", "/v1/chat/completions", true},
		{"/v1/completions", "openai", "/v1/completions", true},
		{"/v1/models", "openai", "/v1/models", true},
		{"/v1/embeddings", "openai", "/v1/embeddings", true},

		// Anthropic paths
		{"/v1/messages", "anthropic", "/v1/messages", true},

		// Google paths
		{"/v1beta/models/gemini-pro:generateContent", "google", "/v1beta/models/gemini-pro:generateContent", true},

		// Explicit provider routing
		{"/proxy/openai/chat/completions", "openai", "/v1/chat/completions", true},
		{"/proxy/anthropic/v1/messages", "anthropic", "/v1/messages", true},
		{"/proxy/google/v1beta/models/gemini-pro", "google", "/v1beta/models/gemini-pro", true},

		// Unknown paths
		{"/unknown/path", "", "", false},
		{"/proxy/unknown/endpoint", "", "", false},
		{"/", "", "", false},
	}

	for _, tt := range tests {
		provider, path, ok := DetectProvider(tt.path)
		if ok != tt.wantOK {
			t.Errorf("DetectProvider(%q) ok = %v, want %v", tt.path, ok, tt.wantOK)
			continue
		}
		if !ok {
			continue
		}
		if provider.Name != tt.wantProvider {
			t.Errorf("DetectProvider(%q) provider = %q, want %q", tt.path, provider.Name, tt.wantProvider)
		}
		if path != tt.wantPath {
			t.Errorf("DetectProvider(%q) path = %q, want %q", tt.path, path, tt.wantPath)
		}
	}
}

func TestShouldForwardHeader(t *testing.T) {
	tests := []struct {
		header string
		want   bool
	}{
		{"Content-Type", true},
		{"Authorization", true},
		{"X-Custom-Header", true},
		{"X-Zentinelle-Key", false},
		{"Host", false},
		{"Connection", false},
		{"Transfer-Encoding", false},
		{"X-Forwarded-For", false},
		{"X-Real-IP", false},
	}

	for _, tt := range tests {
		got := ShouldForwardHeader(tt.header)
		if got != tt.want {
			t.Errorf("ShouldForwardHeader(%q) = %v, want %v", tt.header, got, tt.want)
		}
	}
}

// --- Health endpoint test ---

func TestHealthEndpoint(t *testing.T) {
	cfg := &Config{
		Port:            "8742",
		ZentinelleURL:   "http://localhost:8080",
		FailOpen:        true,
		PolicyTimeout:   2 * time.Second,
		ProviderAPIKeys: map[string]string{"openai": "sk-test", "anthropic": "sk-ant-test"},
	}

	gw := NewGateway(cfg)
	req := httptest.NewRequest(http.MethodGet, "/health", nil)
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("health status = %d, want %d", w.Code, http.StatusOK)
	}

	var body map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("failed to parse health response: %v", err)
	}

	if body["status"] != "ok" {
		t.Errorf("health status = %v, want %q", body["status"], "ok")
	}

	providers, ok := body["providers"].([]interface{})
	if !ok {
		t.Fatal("providers should be a list")
	}
	if len(providers) != 2 {
		t.Errorf("providers count = %d, want 2 (openai, anthropic)", len(providers))
	}
}

func TestHealthEndpointMethodNotAllowed(t *testing.T) {
	cfg := &Config{
		Port:          "8742",
		ZentinelleURL: "http://localhost:8080",
	}

	gw := NewGateway(cfg)
	req := httptest.NewRequest(http.MethodPost, "/health", nil)
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusMethodNotAllowed {
		t.Errorf("health POST status = %d, want %d", w.Code, http.StatusMethodNotAllowed)
	}
}

// --- Proxy handler tests ---

func TestMissingZentinelleKey(t *testing.T) {
	cfg := &Config{
		Port:          "8742",
		ZentinelleURL: "http://localhost:8080",
		FailOpen:      true,
		PolicyTimeout: 2 * time.Second,
	}

	gw := NewGateway(cfg)
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}

	var body map[string]string
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["error"] != "missing_key" {
		t.Errorf("error = %q, want %q", body["error"], "missing_key")
	}
}

func TestUnknownRoute(t *testing.T) {
	cfg := &Config{
		Port:          "8742",
		ZentinelleURL: "http://localhost:8080",
		FailOpen:      true,
		PolicyTimeout: 2 * time.Second,
	}

	gw := NewGateway(cfg)
	req := httptest.NewRequest(http.MethodPost, "/unknown/endpoint", nil)
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestNoAPIKey(t *testing.T) {
	// Set up a mock Zentinelle that always allows
	zentinelle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"allowed": true,
			"reason":  "allowed",
		})
	}))
	defer zentinelle.Close()

	cfg := &Config{
		Port:          "8742",
		ZentinelleURL: zentinelle.URL,
		FailOpen:      true,
		PolicyTimeout: 2 * time.Second,
		// No API keys configured
	}

	gw := NewGateway(cfg)
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}

	var body map[string]string
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["error"] != "no_api_key" {
		t.Errorf("error = %q, want %q", body["error"], "no_api_key")
	}
}

func TestPolicyDenied(t *testing.T) {
	// Set up a mock Zentinelle that always denies
	zentinelle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"allowed": false,
			"reason":  "model gpt-4o is not allowed for this agent",
		})
	}))
	defer zentinelle.Close()

	cfg := &Config{
		Port:            "8742",
		ZentinelleURL:   zentinelle.URL,
		FailOpen:        true,
		PolicyTimeout:   2 * time.Second,
		ProviderAPIKeys: map[string]string{"openai": "sk-test-key"},
	}

	gw := NewGateway(cfg)
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}

	var body map[string]string
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["error"] != "policy_denied" {
		t.Errorf("error = %q, want %q", body["error"], "policy_denied")
	}
}

// --- Policy check request building tests ---

func TestPolicyCheckRequestFormat(t *testing.T) {
	var receivedBody map[string]interface{}
	var receivedHeaders http.Header

	zentinelle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedHeaders = r.Header

		var body map[string]interface{}
		json.NewDecoder(r.Body).Decode(&body)
		receivedBody = body

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"allowed": true,
			"reason":  "allowed",
		})
	}))
	defer zentinelle.Close()

	cfg := &Config{
		Port:            "8742",
		ZentinelleURL:   zentinelle.URL,
		FailOpen:        true,
		PolicyTimeout:   2 * time.Second,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}

	// Use CheckPolicy directly
	bgCtx := context.Background()
	CheckPolicy(bgCtx, cfg, "sk_agent_test123", "openai", "gpt-4o")

	// Verify request body structure
	if receivedBody["action"] != "llm:invoke" {
		t.Errorf("action = %v, want %q", receivedBody["action"], "llm:invoke")
	}

	evalCtx, ok := receivedBody["context"].(map[string]interface{})
	if !ok {
		t.Fatal("context should be a map")
	}
	if evalCtx["provider"] != "openai" {
		t.Errorf("context.provider = %v, want %q", evalCtx["provider"], "openai")
	}
	if evalCtx["model"] != "gpt-4o" {
		t.Errorf("context.model = %v, want %q", evalCtx["model"], "gpt-4o")
	}

	// Verify headers
	if receivedHeaders.Get("X-Zentinelle-Key") != "sk_agent_test123" {
		t.Errorf("X-Zentinelle-Key = %q, want %q", receivedHeaders.Get("X-Zentinelle-Key"), "sk_agent_test123")
	}
	if receivedHeaders.Get("Content-Type") != "application/json" {
		t.Errorf("Content-Type = %q, want %q", receivedHeaders.Get("Content-Type"), "application/json")
	}
}

func TestPolicyFailOpen(t *testing.T) {
	cfg := &Config{
		ZentinelleURL: "http://127.0.0.1:1", // unreachable
		FailOpen:      true,
		PolicyTimeout: 100 * time.Millisecond,
	}

	result := CheckPolicy(context.Background(), cfg, "sk_agent_test", "openai", "gpt-4o")
	if !result.Allowed {
		t.Error("fail-open: should allow when zentinelle unreachable")
	}
	if !strings.Contains(result.Reason, "fail-open") {
		t.Errorf("reason should contain 'fail-open', got %q", result.Reason)
	}
}

func TestPolicyFailClosed(t *testing.T) {
	cfg := &Config{
		ZentinelleURL: "http://127.0.0.1:1", // unreachable
		FailOpen:      false,
		PolicyTimeout: 100 * time.Millisecond,
	}

	result := CheckPolicy(context.Background(), cfg, "sk_agent_test", "openai", "gpt-4o")
	if result.Allowed {
		t.Error("fail-closed: should deny when zentinelle unreachable")
	}
	if !strings.Contains(result.Reason, "fail-closed") {
		t.Errorf("reason should contain 'fail-closed', got %q", result.Reason)
	}
}

// --- Usage extraction tests ---

func TestExtractUsageOpenAI(t *testing.T) {
	body := `{
		"id": "chatcmpl-abc123",
		"object": "chat.completion",
		"model": "gpt-4o",
		"choices": [{"message": {"content": "Hello!"}}],
		"usage": {
			"prompt_tokens": 100,
			"completion_tokens": 25,
			"total_tokens": 125
		}
	}`

	usage := ExtractUsage([]byte(body), "openai")
	if usage.PromptTokens != 100 {
		t.Errorf("PromptTokens = %d, want 100", usage.PromptTokens)
	}
	if usage.CompletionTokens != 25 {
		t.Errorf("CompletionTokens = %d, want 25", usage.CompletionTokens)
	}
}

func TestExtractUsageAnthropic(t *testing.T) {
	body := `{
		"id": "msg_abc123",
		"type": "message",
		"model": "claude-3-5-sonnet-20241022",
		"content": [{"type": "text", "text": "Hello!"}],
		"usage": {
			"input_tokens": 50,
			"output_tokens": 15
		}
	}`

	usage := ExtractUsage([]byte(body), "anthropic")
	if usage.PromptTokens != 50 {
		t.Errorf("PromptTokens = %d, want 50", usage.PromptTokens)
	}
	if usage.CompletionTokens != 15 {
		t.Errorf("CompletionTokens = %d, want 15", usage.CompletionTokens)
	}
}

func TestExtractUsageSSE(t *testing.T) {
	body := `data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"Hi"}}]}
data: {"id":"chatcmpl-1","choices":[{"delta":{"content":"!"}}]}
data: {"id":"chatcmpl-1","choices":[],"usage":{"prompt_tokens":10,"completion_tokens":5}}
data: [DONE]
`

	usage := ExtractUsage([]byte(body), "openai")
	if usage.PromptTokens != 10 {
		t.Errorf("PromptTokens = %d, want 10", usage.PromptTokens)
	}
	if usage.CompletionTokens != 5 {
		t.Errorf("CompletionTokens = %d, want 5", usage.CompletionTokens)
	}
}

func TestExtractUsageEmpty(t *testing.T) {
	usage := ExtractUsage(nil, "openai")
	if usage.PromptTokens != 0 || usage.CompletionTokens != 0 {
		t.Error("empty body should return zero usage")
	}

	usage = ExtractUsage([]byte("not json"), "openai")
	if usage.PromptTokens != 0 || usage.CompletionTokens != 0 {
		t.Error("invalid JSON should return zero usage")
	}
}

func TestExtractUsageGoogle(t *testing.T) {
	body := `{
		"candidates": [{"content": {"parts": [{"text": "Hello!"}]}}],
		"usage": {
			"promptTokenCount": 30,
			"candidatesTokenCount": 10,
			"totalTokenCount": 40
		}
	}`

	usage := ExtractUsage([]byte(body), "google")
	if usage.PromptTokens != 30 {
		t.Errorf("PromptTokens = %d, want 30", usage.PromptTokens)
	}
	if usage.CompletionTokens != 10 {
		t.Errorf("CompletionTokens = %d, want 10", usage.CompletionTokens)
	}
}

// --- Streaming detection tests ---

func TestIsStreamingRequest(t *testing.T) {
	tests := []struct {
		name   string
		body   string
		accept string
		want   bool
	}{
		{"stream true", `{"model":"gpt-4o","stream":true}`, "", true},
		{"stream false", `{"model":"gpt-4o","stream":false}`, "", false},
		{"no stream field", `{"model":"gpt-4o"}`, "", false},
		{"accept sse", `{"model":"gpt-4o"}`, "text/event-stream", true},
		{"stream true with spaces", `{"model":"gpt-4o", "stream": true}`, "", true},
		{"empty body", "", "", false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := isStreamingRequest([]byte(tt.body), tt.accept)
			if got != tt.want {
				t.Errorf("isStreamingRequest() = %v, want %v", got, tt.want)
			}
		})
	}
}

// --- Request ID test ---

func TestGenerateRequestID(t *testing.T) {
	id1 := generateRequestID()
	id2 := generateRequestID()

	if id1 == "" {
		t.Error("request ID should not be empty")
	}
	if id1 == id2 {
		t.Error("request IDs should be unique")
	}
	// UUID v4 format: 8-4-4-4-12 hex chars
	parts := strings.Split(id1, "-")
	if len(parts) != 5 {
		t.Errorf("request ID should have 5 parts separated by hyphens, got %d: %s", len(parts), id1)
	}
}

// --- Model extraction test ---

func TestExtractModel(t *testing.T) {
	tests := []struct {
		name     string
		body     string
		provider string
		want     string
	}{
		{"openai model", `{"model":"gpt-4o","messages":[]}`, "openai", "gpt-4o"},
		{"anthropic model", `{"model":"claude-3-5-sonnet-20241022","messages":[]}`, "anthropic", "claude-3-5-sonnet-20241022"},
		{"no model field", `{"messages":[]}`, "openai", ""},
		{"empty body", "", "openai", ""},
		{"invalid json", "not json", "openai", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := extractModel([]byte(tt.body), tt.provider)
			if got != tt.want {
				t.Errorf("extractModel() = %q, want %q", got, tt.want)
			}
		})
	}
}

// --- End-to-end proxy test ---

func TestFullProxyFlow(t *testing.T) {
	// Mock upstream provider
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Verify auth header was injected
		if r.Header.Get("Authorization") != "Bearer sk-real-openai-key" {
			t.Errorf("upstream Authorization = %q, want %q", r.Header.Get("Authorization"), "Bearer sk-real-openai-key")
		}

		// Verify zentinelle key was stripped
		if r.Header.Get("X-Zentinelle-Key") != "" {
			t.Error("X-Zentinelle-Key should be stripped before forwarding")
		}

		// Verify request ID was forwarded
		if r.Header.Get("X-Request-ID") == "" {
			t.Error("X-Request-ID should be forwarded")
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"id":      "chatcmpl-test",
			"model":   "gpt-4o",
			"choices": []map[string]interface{}{{"message": map[string]string{"content": "Hello!"}}},
			"usage": map[string]int{
				"prompt_tokens":     10,
				"completion_tokens": 5,
			},
		})
	}))
	defer upstream.Close()

	// Mock Zentinelle
	zentinelle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case strings.Contains(r.URL.Path, "/evaluate"):
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]interface{}{
				"allowed": true,
				"reason":  "allowed",
			})
		case strings.Contains(r.URL.Path, "/events"):
			w.WriteHeader(http.StatusAccepted)
		}
	}))
	defer zentinelle.Close()

	// Override provider base URL for testing
	origProvider := providers["openai"]
	providers["openai"] = Provider{
		Name:       "openai",
		BaseURL:    upstream.URL,
		AuthHeader: "Authorization",
		AuthPrefix: "Bearer ",
	}
	defer func() { providers["openai"] = origProvider }()

	cfg := &Config{
		Port:             "8742",
		ZentinelleURL:    zentinelle.URL,
		FailOpen:         true,
		PolicyTimeout:    2 * time.Second,
		MaxResponseBytes: 52428800,
		ProviderAPIKeys:  map[string]string{"openai": "sk-real-openai-key"},
	}

	gw := NewGateway(cfg)
	body := `{"model":"gpt-4o","messages":[{"role":"user","content":"hello"}]}`
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(body))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d; body = %s", w.Code, http.StatusOK, w.Body.String())
	}

	// Verify response has request ID
	if w.Header().Get("X-Request-ID") == "" {
		t.Error("response should include X-Request-ID")
	}

	var respBody map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &respBody); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if respBody["id"] != "chatcmpl-test" {
		t.Errorf("response id = %v, want %q", respBody["id"], "chatcmpl-test")
	}
}

// TestPolicyClientReusesConnections is the point of the pooled transport, and
// it is asserted by counting connections rather than by reading the transport's
// fields back: a client can be configured for pooling and still open a socket
// per call if something upstream of it changes, and the field values would
// still look right.
//
// http.DefaultClient, which CheckPolicy used, fails this: its transport keeps
// two idle connections per host, and each policy check paid a TCP handshake
// (plus a TLS one, off the loopback) on the request path of every proxied LLM
// call.
func TestPolicyClientReusesConnections(t *testing.T) {
	var mu sync.Mutex
	conns := map[string]bool{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"allowed": true, "reason": "ok"}`))
	}))
	srv.Config.ConnState = func(c net.Conn, state http.ConnState) {
		if state == http.StateNew {
			mu.Lock()
			conns[c.RemoteAddr().String()] = true
			mu.Unlock()
		}
	}
	defer srv.Close()

	cfg := &Config{ZentinelleURL: srv.URL, PolicyTimeout: 5 * time.Second, FailOpen: false}
	for i := 0; i < 10; i++ {
		if got := CheckPolicy(context.Background(), cfg, "key", "openai", "gpt-4"); !got.Allowed {
			t.Fatalf("call %d: policy check failed: %s", i, got.Reason)
		}
	}

	mu.Lock()
	opened := len(conns)
	mu.Unlock()
	if opened != 1 {
		t.Errorf("10 policy checks opened %d connections, want 1: the transport is not pooling", opened)
	}
}

// The usage reporter had it worse than the policy check: it built a new
// http.Client, and so a new Transport, on every call, which cannot reuse a
// connection even in principle. This holds the fix to the same standard.
func TestUsageClientReusesConnections(t *testing.T) {
	var mu sync.Mutex
	conns := map[string]bool{}
	idle := make(chan struct{}, 32)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	srv.Config.ConnState = func(c net.Conn, state http.ConnState) {
		switch state {
		case http.StateNew:
			mu.Lock()
			conns[c.RemoteAddr().String()] = true
			mu.Unlock()
		case http.StateIdle:
			// The connection is back in the pool and the next call can take
			// it. Waiting on this rather than on the handler is what makes the
			// reports sequential: ReportUsage is fire-and-forget, so without it
			// the calls overlap and open connections for the honest reason.
			select {
			case idle <- struct{}{}:
			default:
			}
		}
	}
	defer srv.Close()

	cfg := &Config{ZentinelleURL: srv.URL}
	usage := UsageData{PromptTokens: 1, CompletionTokens: 1}
	for i := 0; i < 10; i++ {
		ReportUsage(cfg, "key", "openai", "gpt-4", usage, 12, "req")
		select {
		case <-idle:
		case <-time.After(5 * time.Second):
			t.Fatalf("usage report %d never completed", i)
		}
	}

	mu.Lock()
	opened := len(conns)
	mu.Unlock()

	// Fewer connections than calls, rather than exactly one. The reporter is
	// fire-and-forget, so a report can start before the previous one has
	// returned its connection to the pool, and those overlaps open a second
	// and third connection for an honest reason. What cannot happen once the
	// client is shared is ten connections for ten calls, which is what a
	// per-call http.Client gives every time.
	if opened >= 10 {
		t.Errorf("10 usage reports opened %d connections: nothing is being reused", opened)
	}
}

// pointOpenAIAt redirects the openai provider's base URL at a stub for the
// duration of one test. The table is package level, which is what makes this
// possible from inside the package and what makes restoring it mandatory.
func pointOpenAIAt(t *testing.T, baseURL string) {
	t.Helper()
	original := providers["openai"]
	replacement := original
	replacement.BaseURL = baseURL
	providers["openai"] = replacement
	t.Cleanup(func() { providers["openai"] = original })
}

// --- Output filtering (#218) ---
//
// The governance gap these cover: the gateway streamed every response straight
// through, so an agent connected via the SDK proxy bypassed output filters
// that applied to anyone on the Django proxy. The filter now runs here too,
// and the response is held until it has.

// zentinelleStub stands in for the control plane. It answers the request-time
// check with `outputFilterRequired`, and the response-time check with `allow`.
func zentinelleStub(t *testing.T, outputFilterRequired, allow bool) (*httptest.Server, *int) {
	t.Helper()
	outputChecks := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req PolicyRequest
		json.NewDecoder(r.Body).Decode(&req)
		w.Header().Set("Content-Type", "application/json")
		if req.Action == "llm:response" {
			outputChecks++
			json.NewEncoder(w).Encode(map[string]interface{}{
				"allowed": allow, "reason": "output filter",
			})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{
			"allowed": true, "reason": "ok",
			"output_filter_required": outputFilterRequired,
		})
	}))
	return srv, &outputChecks
}

// upstreamStub returns a provider that always answers with the given body.
func upstreamStub(t *testing.T, contentType, body string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", contentType)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(body))
	}))
}

func TestOutputFilterWithholdsADeniedResponse(t *testing.T) {
	secret := `{"choices":[{"message":{"content":"the secret"}}]}`
	upstream := upstreamStub(t, "application/json", secret)
	defer upstream.Close()
	control, outputChecks := zentinelleStub(t, true, false)
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	w := httptest.NewRecorder()
	gw.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
	if strings.Contains(w.Body.String(), "the secret") {
		t.Error("the filtered content reached the client anyway")
	}
	if *outputChecks != 1 {
		t.Errorf("output policy checked %d times, want 1", *outputChecks)
	}
}

func TestOutputFilterPassesAnAllowedResponse(t *testing.T) {
	answer := `{"choices":[{"message":{"content":"fine"}}]}`
	upstream := upstreamStub(t, "application/json", answer)
	defer upstream.Close()
	control, outputChecks := zentinelleStub(t, true, true)
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	w := httptest.NewRecorder()
	gw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	if !strings.Contains(w.Body.String(), "fine") {
		t.Errorf("allowed response body = %q, want it delivered", w.Body.String())
	}
	if *outputChecks != 1 {
		t.Errorf("output policy checked %d times, want 1", *outputChecks)
	}
}

func TestNoOutputFilterMeansNoSecondCheckAndNoBuffering(t *testing.T) {
	upstream := upstreamStub(t, "application/json", `{"ok":true}`)
	defer upstream.Close()
	control, outputChecks := zentinelleStub(t, false, true)
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	w := httptest.NewRecorder()
	gw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want 200", w.Code)
	}
	// A tenant with no output filter must not pay for one: no second round
	// trip, and the response is not held back.
	if *outputChecks != 0 {
		t.Errorf("output policy checked %d times with no filter configured, want 0", *outputChecks)
	}
}

func TestSSETextExtractsOnlyContent(t *testing.T) {
	body := []byte("data: {\"delta\":\"one\"}\n\nevent: ping\ndata: {\"delta\":\"two\"}\n\ndata: [DONE]\n")
	got := sseText(body)
	if !strings.Contains(got, "one") || !strings.Contains(got, "two") {
		t.Errorf("sseText dropped content: %q", got)
	}
	if strings.Contains(got, "[DONE]") || strings.Contains(got, "event:") {
		t.Errorf("sseText kept wire framing a filter should not judge: %q", got)
	}
}

// --- Dynamic provider keys (#226) and cluster identity (#227) ---

func TestProviderKeysComeFromTheEnvironmentByConvention(t *testing.T) {
	keys := loadProviderKeys([]string{
		"PROVIDER_KEY_OPENAI=sk-one",
		"PROVIDER_KEY_MISTRAL=sk-two",
		"PROVIDER_KEY_AZURE_OPENAI=sk-three",
		"UNRELATED=ignored",
		"PROVIDER_KEY_EMPTY=",
	})

	for provider, want := range map[string]string{
		"openai":       "sk-one",
		"mistral":      "sk-two",
		"azure_openai": "sk-three",
	} {
		if keys[provider] != want {
			t.Errorf("key for %q = %q, want %q", provider, keys[provider], want)
		}
	}
	if _, present := keys["empty"]; present {
		t.Error("an empty PROVIDER_KEY_ value was taken as a configured provider")
	}
	if _, present := keys["unrelated"]; present {
		t.Error("a variable outside the convention was read as a provider key")
	}
}

func TestTheOriginalKeyVariablesStillWork(t *testing.T) {
	// They are in every existing deployment's task definition. A rename that
	// silently dropped them would produce a gateway that starts cleanly and
	// then refuses every request to that provider.
	t.Setenv("OPENAI_API_KEY", "sk-legacy")
	t.Setenv("ANTHROPIC_API_KEY", "sk-ant-legacy")

	keys := loadProviderKeys(nil)
	if keys["openai"] != "sk-legacy" || keys["anthropic"] != "sk-ant-legacy" {
		t.Errorf("the original variables were dropped: %v", keys)
	}
}

func TestAnExplicitProviderKeyWinsOverTheOriginalVariable(t *testing.T) {
	t.Setenv("OPENAI_API_KEY", "sk-old")
	keys := loadProviderKeys([]string{"PROVIDER_KEY_OPENAI=sk-new"})
	if keys["openai"] != "sk-new" {
		t.Errorf("key for openai = %q, want the explicit sk-new", keys["openai"])
	}
}

func TestIdentityHeadersAreSentToZentinelle(t *testing.T) {
	var gotTenant, gotCluster string
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotTenant = r.Header.Get("X-Zentinelle-Tenant")
		gotCluster = r.Header.Get("X-Zentinelle-Cluster")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"allowed": true, "reason": "ok"}`))
	}))
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, PolicyTimeout: 5 * time.Second,
		TenantID: "acme-corp", ClusterID: "prod-us-east-1",
	}
	CheckPolicy(context.Background(), cfg, "sk_agent_test", "openai", "gpt-4o")

	if gotTenant != "acme-corp" || gotCluster != "prod-us-east-1" {
		t.Errorf("identity headers = %q/%q, want acme-corp/prod-us-east-1", gotTenant, gotCluster)
	}
}

func TestNoIdentityHeadersWhenUnset(t *testing.T) {
	// A single-cluster deployment's requests must be unchanged: an empty
	// header is not the same as no header to anything reading it.
	var present bool
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, tenant := r.Header["X-Zentinelle-Tenant"]
		_, cluster := r.Header["X-Zentinelle-Cluster"]
		present = tenant || cluster
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"allowed": true, "reason": "ok"}`))
	}))
	defer control.Close()

	cfg := &Config{ZentinelleURL: control.URL, PolicyTimeout: 5 * time.Second}
	CheckPolicy(context.Background(), cfg, "sk_agent_test", "openai", "gpt-4o")

	if present {
		t.Error("an identity header was sent by a gateway that has no tenant or cluster configured")
	}
}

// --- Prometheus metrics (#224) ---

func TestMetricsEndpointExposesTheTextFormat(t *testing.T) {
	cfg := &Config{ZentinelleURL: "http://localhost:8080"}
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	w := httptest.NewRecorder()
	gw.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", w.Code)
	}
	if ct := w.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/plain") {
		t.Errorf("Content-Type = %q, want the Prometheus text format", ct)
	}

	body := w.Body.String()
	for _, name := range []string{
		"zentinelle_gateway_requests_total",
		"zentinelle_gateway_policy_denied_total",
		"zentinelle_gateway_request_duration_seconds",
		"zentinelle_gateway_policy_check_duration_seconds",
		"zentinelle_gateway_upstream_duration_seconds",
		"zentinelle_gateway_active_connections",
		"zentinelle_gateway_upstream_errors_total",
		"zentinelle_gateway_policy_check_errors_total",
	} {
		if !strings.Contains(body, "# TYPE "+name) {
			t.Errorf("%s is not exposed", name)
		}
	}
}

func TestAProxiedRequestIsCounted(t *testing.T) {
	before := metricRequests.snapshot()

	upstream := upstreamStub(t, "application/json", `{"ok":true}`)
	defer upstream.Close()
	control, _ := zentinelleStub(t, false, true)
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	gw.ServeHTTP(httptest.NewRecorder(), req)

	key := labels("model", "gpt-4o", "provider", "openai", "status_code", "200")
	if metricRequests.snapshot()[key] <= before[key] {
		t.Errorf("a completed request did not increment %s{%s}", "zentinelle_gateway_requests_total", key)
	}

	if !strings.Contains(renderMetrics(), `zentinelle_gateway_requests_total{model="gpt-4o"`) {
		t.Error("the counter is not rendered with its labels")
	}
}

func TestADeniedRequestIsCountedWithoutTheReason(t *testing.T) {
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"allowed": false, "reason": "a very specific free text reason"}`))
	}))
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	w := httptest.NewRecorder()
	gw.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403", w.Code)
	}
	rendered := renderMetrics()
	if !strings.Contains(rendered, "zentinelle_gateway_policy_denied_total{provider=\"openai\"}") {
		t.Error("a policy denial was not counted")
	}
	// The reason is free text written by whoever wrote the policy. As a label
	// it would let a customer create unbounded series in the scraper.
	if strings.Contains(rendered, "a very specific free text reason") {
		t.Error("the policy reason was used as a label, which is unbounded cardinality")
	}
}

func TestLabelCardinalityIsCapped(t *testing.T) {
	vec := newCounterVec()
	for i := 0; i < maxLabelSets+50; i++ {
		vec.inc(labels("model", "m"+strconv.Itoa(i)))
	}
	snapshot := vec.snapshot()
	if len(snapshot) > maxLabelSets+1 {
		t.Errorf("%d distinct series, want at most %d plus overflow", len(snapshot), maxLabelSets)
	}
	if snapshot["overflow"] == 0 {
		t.Error("nothing was folded into the overflow series")
	}
}

func TestHistogramBucketsAreCumulative(t *testing.T) {
	vec := newHistogramVec()
	vec.observe("", 0.02)
	vec.observe("", 3)

	entry := vec.snapshot()[""]
	if entry.total != 2 {
		t.Errorf("count = %d, want 2", entry.total)
	}
	// 0.02s falls in every bucket from 0.025 up; 3s only from 5 up.
	for i, upper := range latencyBuckets {
		var want uint64
		if upper >= 3 {
			want = 2
		} else if upper >= 0.02 {
			want = 1
		}
		if entry.counts[i] != want {
			t.Errorf("bucket le=%v = %d, want %d", upper, entry.counts[i], want)
		}
	}
}

// --- Interaction logging (#225) ---

// interactionRecorder captures what the gateway posts to /interaction.
func interactionRecorder(t *testing.T) (*httptest.Server, chan InteractionRecord) {
	t.Helper()
	records := make(chan InteractionRecord, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if strings.HasSuffix(r.URL.Path, "/interaction") {
			var rec InteractionRecord
			json.NewDecoder(r.Body).Decode(&rec)
			records <- rec
			w.WriteHeader(http.StatusCreated)
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"allowed": true, "reason": "ok"})
	}))
	return srv, records
}

func TestAnInteractionIsLoggedAfterTheResponse(t *testing.T) {
	t.Setenv("LOG_INTERACTIONS", "true")

	answer := `{"choices":[{"message":{"content":"hello"}}],"usage":{"prompt_tokens":11,"completion_tokens":22}}`
	upstream := upstreamStub(t, "application/json", answer)
	defer upstream.Close()
	control, records := interactionRecorder(t)
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"ask"}]}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	gw.ServeHTTP(httptest.NewRecorder(), req)

	select {
	case rec := <-records:
		if !strings.Contains(rec.InputContent, "ask") {
			t.Errorf("the prompt was not recorded: %q", rec.InputContent)
		}
		if !strings.Contains(rec.OutputContent, "hello") {
			t.Errorf("the completion was not recorded: %q", rec.OutputContent)
		}
		if rec.AIModel != "gpt-4o" || rec.AIProvider != "openai" {
			t.Errorf("provider/model = %q/%q", rec.AIProvider, rec.AIModel)
		}
		// The field names the endpoint actually reads. The issue's sample used
		// prompt_tokens/completion_tokens, which that endpoint ignores — it
		// would have answered 201 and stored null.
		if rec.InputTokenCount != 11 || rec.OutputTokenCount != 22 {
			t.Errorf("token counts = %d/%d, want 11/22", rec.InputTokenCount, rec.OutputTokenCount)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("no interaction was logged")
	}
}

func TestInteractionLoggingCanBeTurnedOff(t *testing.T) {
	t.Setenv("LOG_INTERACTIONS", "false")

	upstream := upstreamStub(t, "application/json",
		`{"choices":[{"message":{"content":"private"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}}`)
	defer upstream.Close()
	control, records := interactionRecorder(t)
	defer control.Close()

	cfg := &Config{
		ZentinelleURL: control.URL, FailOpen: false,
		PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"},
	}
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(cfg)

	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"gpt-4o"}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	gw.ServeHTTP(httptest.NewRecorder(), req)

	select {
	case rec := <-records:
		t.Errorf("prompt content was sent by a deployment that turned logging off: %q", rec.InputContent)
	case <-time.After(500 * time.Millisecond):
		// Nothing sent, which is the point.
	}
}

func TestAnUnparseableLogInteractionsValueDisablesLogging(t *testing.T) {
	// A typo is not permission to ship prompt text.
	t.Setenv("LOG_INTERACTIONS", "no-thanks")
	if interactionLoggingEnabled() {
		t.Error("an unparseable LOG_INTERACTIONS was read as enabled")
	}
}

func TestInteractionLoggingIsOnByDefault(t *testing.T) {
	t.Setenv("LOG_INTERACTIONS", "")
	if !interactionLoggingEnabled() {
		t.Error("logging is off by default, so the gateway records less than the Django proxy on the same product")
	}
}
