package main

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
)

// Every control-plane client that carries a credential must not follow a
// redirect, or Go would re-send the credential headers to the target (#397).
func TestControlPlaneClientsDoNotFollowRedirects(t *testing.T) {
	var leaked atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Zentinelle-Key") != "" || r.Header.Get("X-Zentinelle-Gateway-Credential") != "" {
			leaked.Add(1)
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()
	redirector := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, target.URL+"/stolen", http.StatusTemporaryRedirect)
	}))
	defer redirector.Close()

	clients := map[string]*http.Client{
		"policy":    policyClient,
		"usage":     usageClient,
		"heartbeat": heartbeatClient,
	}
	for name, client := range clients {
		req, _ := http.NewRequest(http.MethodPost, redirector.URL+"/api/zentinelle/v1/evaluate", nil)
		req.Header.Set("X-Zentinelle-Key", "sk_agent_secret")
		req.Header.Set("X-Zentinelle-Gateway-Credential", "sk_gateway_secret")
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		resp.Body.Close()
		if resp.StatusCode != http.StatusTemporaryRedirect {
			t.Errorf("%s: followed the redirect (status %d)", name, resp.StatusCode)
		}
	}
	if n := leaked.Load(); n != 0 {
		t.Fatalf("credentials reached the redirect target %d time(s)", n)
	}
}
