package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type controlPlaneCall struct {
	path, auth, contentType, zentinelleKey, body string
}

// passthroughRig is a gateway whose Zentinelle is down (every call 503s and is
// counted) and whose control plane records what reached it.
func passthroughRig(t *testing.T) (*Gateway, *int64, chan controlPlaneCall) {
	t.Helper()
	var zentinelleCalls int64
	zentinelle := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&zentinelleCalls, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	t.Cleanup(zentinelle.Close)

	calls := make(chan controlPlaneCall, 4)
	controlPlane := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		calls <- controlPlaneCall{
			path:          r.URL.RequestURI(),
			auth:          r.Header.Get("Authorization"),
			contentType:   r.Header.Get("Content-Type"),
			zentinelleKey: r.Header.Get("X-Zentinelle-Key"),
			body:          string(body),
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Set-Cookie", "session=leak")
		w.WriteHeader(http.StatusOK)
		io.WriteString(w, `{"ok": true, "continue": true}`)
	}))
	t.Cleanup(controlPlane.Close)

	gw := NewGateway(&Config{
		ZentinelleURL:     zentinelle.URL,
		ControlPlaneURL:   controlPlane.URL,
		GatewayCredential: testGatewayCredential,
		PolicyTimeout:     time.Second,
		MaxResponseBytes:  1 << 20,
	})
	return gw, &zentinelleCalls, calls
}

func TestAgentHeartbeatAndEventsPassThroughWhileZentinelleIsDown(t *testing.T) {
	for _, path := range []string{
		"/api/dispatch/v1/agents/3f1c2a4e-9b7d-4c1e-8a2f-0d6e5b4c3a21/callback/",
		"/api/clusters/v1/0b7e9c2d-1a3f-4e5d-9c8b-7a6f5e4d3c2b/heartbeat/",
		"/api/clusters/v1/0b7e9c2d-1a3f-4e5d-9c8b-7a6f5e4d3c2b/model-test-result/",
	} {
		t.Run(path, func(t *testing.T) {
			gw, zentinelleCalls, calls := passthroughRig(t)
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"status":"running","events":[]}`))
			req.Header.Set("Authorization", "Bearer cluster-key")
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-Zentinelle-Key", "sk_agent_must_not_leave")
			req.Header.Set("Cookie", "portal=secret")
			w := httptest.NewRecorder()

			gw.ServeHTTP(w, req)

			if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"continue": true`) {
				t.Fatalf("got %d %q, want the control plane's 200 answer", w.Code, w.Body.String())
			}
			if w.Header().Get("Set-Cookie") != "" {
				t.Error("only the Content-Type of the control plane's answer is passed back")
			}
			got := <-calls
			if got.path != path || got.auth != "Bearer cluster-key" || got.contentType != "application/json" ||
				got.body != `{"status":"running","events":[]}` {
				t.Errorf("control plane got %+v", got)
			}
			if got.zentinelleKey != "" {
				t.Error("the agent's Zentinelle key must not be sent to the control plane")
			}
			if n := atomic.LoadInt64(zentinelleCalls); n != 0 {
				t.Errorf("Zentinelle was called %d times; heartbeat and events must not depend on it", n)
			}
			if n := gw.stats.requests.Load(); n != 0 {
				t.Errorf("requests counter = %d; passed-through calls are not model traffic", n)
			}
		})
	}
}

func TestPassthroughIsOnlyThoseRoutes(t *testing.T) {
	for _, path := range []string{
		"/api/dispatch/v1/agents/abc/checkin/",
		"/api/dispatch/v1/agents/abc/callback",
		"/api/dispatch/v1/agents/a/b/callback/",
		"/api/dispatch/v1/agents/../callback/",
		"/api/dispatch/v1/agents/a%2Fb/callback/",
		"/api/clusters/v1/abc/model-test-result",
		"/api/clusters/v1/abc/heartbeat/model-test-result/",
		"/api/dispatch/v1/tasks/abc/status/",
		"/x/api/clusters/v1/abc/heartbeat/",
		"/api/clusters/v1/abc/heartbeat/?next=http://elsewhere",
	} {
		t.Run(path, func(t *testing.T) {
			gw, _, calls := passthroughRig(t)
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
			req.Header.Set("Authorization", "Bearer cluster-key")
			req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
			w := httptest.NewRecorder()

			gw.ServeHTTP(w, req)

			select {
			case got := <-calls:
				if strings.Contains(path, "?") {
					if got.path != strings.SplitN(path, "?", 2)[0] {
						t.Errorf("control plane got %q; the query must not be passed on", got.path)
					}
					return
				}
				t.Errorf("%s reached the control plane", path)
			default:
				if strings.Contains(path, "?") {
					t.Errorf("the heartbeat route with a query should still pass, without it")
				}
			}
		})
	}
}

func TestPassthroughRefusesWithoutBearerOrPost(t *testing.T) {
	path := "/api/clusters/v1/abc/heartbeat/"
	for _, tc := range []struct {
		name, method, auth string
		want               int
	}{
		{"no auth", http.MethodPost, "", http.StatusUnauthorized},
		{"empty bearer", http.MethodPost, "Bearer ", http.StatusUnauthorized},
		{"basic", http.MethodPost, "Basic dXNlcjpwYXNz", http.StatusUnauthorized},
		{"get", http.MethodGet, "Bearer cluster-key", http.StatusMethodNotAllowed},
	} {
		t.Run(tc.name, func(t *testing.T) {
			gw, _, calls := passthroughRig(t)
			req := httptest.NewRequest(tc.method, path, strings.NewReader(`{}`))
			if tc.auth != "" {
				req.Header.Set("Authorization", tc.auth)
			}
			w := httptest.NewRecorder()

			gw.ServeHTTP(w, req)

			if w.Code != tc.want {
				t.Errorf("status = %d, want %d", w.Code, tc.want)
			}
			if len(calls) != 0 {
				t.Error("a refused call must not reach the control plane")
			}
		})
	}
}

func TestNoPassthroughWithoutAControlPlane(t *testing.T) {
	gw, _, calls := passthroughRig(t)
	gw.cfg.ControlPlaneURL = ""
	req := httptest.NewRequest(http.MethodPost, "/api/clusters/v1/abc/heartbeat/", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer cluster-key")
	w := httptest.NewRecorder()

	gw.ServeHTTP(w, req)

	if len(calls) != 0 {
		t.Error("with no control plane configured nothing is passed through")
	}
	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want the proxy's own 401 for a missing Zentinelle key", w.Code)
	}
}

func TestControlPlaneURLIsSchemeAndHostOnly(t *testing.T) {
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", testGatewayCredential)
	t.Setenv("ASTROLIFT_CONTROL_PLANE_URL", "https://astrolift.example.com/")
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatalf("LoadConfig: %v", err)
	}
	if cfg.ControlPlaneURL != "https://astrolift.example.com" {
		t.Errorf("ControlPlaneURL = %q", cfg.ControlPlaneURL)
	}

	for _, bad := range []string{
		"astrolift.example.com",
		"ftp://astrolift.example.com",
		"https://user:pass@astrolift.example.com",
		"https://astrolift.example.com/prefix",
		"https://astrolift.example.com?x=1",
		"https://",
	} {
		t.Setenv("ASTROLIFT_CONTROL_PLANE_URL", bad)
		if _, err := LoadConfig(); err == nil {
			t.Errorf("ASTROLIFT_CONTROL_PLANE_URL=%q was accepted", bad)
		}
	}
}
