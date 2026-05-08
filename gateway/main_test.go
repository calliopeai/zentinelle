package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
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
		OpenAIKey:    "sk-openai",
		AnthropicKey: "sk-anthropic",
		GoogleKey:    "goog-key",
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
		Port:          "8742",
		ZentinelleURL: "http://localhost:8080",
		FailOpen:      true,
		PolicyTimeout: 2 * time.Second,
		OpenAIKey:     "sk-test",
		AnthropicKey:  "sk-ant-test",
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
		Port:          "8742",
		ZentinelleURL: zentinelle.URL,
		FailOpen:      true,
		PolicyTimeout: 2 * time.Second,
		OpenAIKey:     "sk-test-key",
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
		Port:          "8742",
		ZentinelleURL: zentinelle.URL,
		FailOpen:      true,
		PolicyTimeout: 2 * time.Second,
		OpenAIKey:     "sk-test",
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
		OpenAIKey:        "sk-real-openai-key",
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
