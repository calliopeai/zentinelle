package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// T8: only inference requests reach a provider on the tenant's key. Files,
// batches, fine-tunes, vector stores and model listings are refused before
// the policy check and the key lookup, since policy never sees them.
func TestOnlyInferenceRoutesAreForwarded(t *testing.T) {
	control, lookups := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"openai": "sk-stored", "anthropic": "sk-ant-stored", "google": "g-stored"},
	})
	upstream, seen := recordingUpstream(t)
	for _, name := range []string{"openai", "anthropic", "google"} {
		pointProviderAt(t, name, upstream.URL)
	}
	gw := NewGateway(storedKeyConfig(control.URL))

	send := func(method, path string) int {
		req := httptest.NewRequest(method, path, strings.NewReader(`{"model":"m"}`))
		req.Header.Set("X-Zentinelle-Key", "sk_agent_tenant_a")
		w := httptest.NewRecorder()
		gw.ServeHTTP(w, req)
		return w.Code
	}

	for _, refused := range []struct{ method, path string }{
		{http.MethodGet, "/v1/files"},
		{http.MethodPost, "/v1/files"},
		{http.MethodDelete, "/v1/files/file-1"},
		{http.MethodGet, "/v1/files/file-1/content"},
		{http.MethodPost, "/v1/batches"},
		{http.MethodPost, "/v1/fine_tuning/jobs"},
		{http.MethodPost, "/v1/vector_stores"},
		{http.MethodGet, "/v1/models"},
		{http.MethodGet, "/v1/chat/completions"},
		{http.MethodPost, "/proxy/openai/files"},
		{http.MethodGet, "/v1/messages/batches"},
		{http.MethodPost, "/v1/messages/batches"},
		{http.MethodPost, "/v1beta/files"},
		{http.MethodPost, "/v1beta/cachedContents"},
		{http.MethodPost, "/v1beta/models/gemini:generateContent/../../files"},
	} {
		if code := send(refused.method, refused.path); code != http.StatusForbidden {
			t.Errorf("%s %s: status = %d, want 403", refused.method, refused.path, code)
		}
	}
	if seen.count() != 0 || lookups.callCount() != 0 {
		t.Fatalf("a refused request reached the provider (%d) or the key lookup (%d)", seen.count(), lookups.callCount())
	}

	for _, allowed := range []string{
		"/v1/chat/completions", "/v1/responses", "/v1/embeddings", "/proxy/openai/chat/completions",
		"/v1/messages", "/v1/messages/count_tokens", "/proxy/anthropic/v1/messages",
		"/v1beta/models/gemini-2.5-pro:generateContent", "/v1beta/models/gemini-2.5-pro:streamGenerateContent",
		"/v1beta/models/text-embedding-004:batchEmbedContents", "/proxy/google/v1/models/gemini:countTokens",
	} {
		if code := send(http.MethodPost, allowed); code != http.StatusOK {
			t.Errorf("POST %s: status = %d, want 200", allowed, code)
		}
	}
}
