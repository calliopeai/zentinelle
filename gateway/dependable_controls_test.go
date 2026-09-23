package main

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestEveryPolicyServiceFailureWithholdsAuthority(t *testing.T) {
	for _, status := range []int{400, 401, 403, 429, 500, 503} {
		t.Run(http.StatusText(status), func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(status)
				w.Write([]byte(`{"allowed":true}`))
			}))
			defer server.Close()
			cfg := &Config{ZentinelleURL: server.URL, PolicyTimeout: time.Second, FailOpen: true}
			if CheckPolicy(context.Background(), cfg, "invalid", "openai", "gpt-4o").Allowed {
				t.Fatal("failed authentication/policy check authorized provider access")
			}
			if CheckOutputPolicy(context.Background(), cfg, "invalid", "openai", "gpt-4o", "private").Allowed {
				t.Fatal("failed output inspection released content")
			}
		})
	}
}

func TestOutputCheckUsesCanonicalContentField(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]interface{}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if _, exists := body["agent_id"]; exists {
			t.Error("workload ID should be derived from the authenticated key")
		}
		ctx := body["context"].(map[string]interface{})
		if ctx["output_text"] != "sensitive response" {
			t.Errorf("missing canonical output: %#v", ctx)
		}
		w.Write([]byte(`{"allowed":false}`))
	}))
	defer server.Close()
	result := CheckOutputPolicy(context.Background(), &Config{ZentinelleURL: server.URL, PolicyTimeout: time.Second}, "test", "openai", "gpt-4o", "sensitive response")
	if result.Allowed {
		t.Fatal("denied content was allowed")
	}
}

func TestFailOpenConfigurationIsRejected(t *testing.T) {
	// A valid key source, so the only thing left to reject is FAIL_OPEN.
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", testGatewayCredential)
	t.Setenv("FAIL_OPEN", "true")
	if _, err := LoadConfig(); err == nil {
		t.Fatal("unsafe authentication fallback accepted")
	}
}
