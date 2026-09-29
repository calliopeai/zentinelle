package main

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"
)

// Per-tenant provider keys (#380): the gateway injects the key the agent's
// tenant stored in Zentinelle, never one the client sent, and uses its own
// env keys only as an explicit single-tenant fallback.

const testGatewayCredential = "sk_gateway_test-0123456789abcdefghijklmnop"

// lookupStub is the control plane's side of the provider-key lookup.
type lookupStub struct {
	mu      sync.Mutex
	calls   int
	headers http.Header
	body    map[string]string
	// failWith answers every lookup with this status when non-zero.
	failWith int
	// failBody is the body sent with failWith.
	failBody string
	// credential is the gateway credential the stub accepts,
	// testGatewayCredential unless a test rotates it.
	credential string
}

func (s *lookupStub) callCount() int {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.calls
}

// controlPlaneStub stands in for Zentinelle. It allows every request, and
// answers the provider-key lookup from stored, keyed by agent key then
// provider, the way the backend resolves the tenant from the agent key. Like
// the backend, it refuses a lookup without the gateway credential.
func controlPlaneStub(t *testing.T, stored map[string]map[string]string) (*httptest.Server, *lookupStub) {
	t.Helper()
	stub := &lookupStub{credential: testGatewayCredential}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case strings.HasSuffix(r.URL.Path, "/evaluate"):
			w.Write([]byte(`{"allowed": true, "reason": "ok"}`))
		case strings.HasSuffix(r.URL.Path, "/gateway/provider-key"):
			var body map[string]string
			json.NewDecoder(r.Body).Decode(&body)
			stub.mu.Lock()
			stub.calls++
			stub.headers = r.Header.Clone()
			stub.body = body
			failWith, failBody, accepted := stub.failWith, stub.failBody, stub.credential
			stub.mu.Unlock()

			if failWith != 0 {
				w.WriteHeader(failWith)
				w.Write([]byte(failBody))
				return
			}
			if r.Header.Get("X-Zentinelle-Gateway-Credential") != accepted {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"detail": "Invalid gateway credential"}`))
				return
			}
			key, ok := stored[r.Header.Get("X-Zentinelle-Key")][body["provider"]]
			if !ok {
				w.WriteHeader(http.StatusNotFound)
				w.Write([]byte(`{"error": "provider_key_not_found", "detail": "none stored"}`))
				return
			}
			json.NewEncoder(w).Encode(map[string]string{"provider": body["provider"], "api_key": key})
		default:
			w.WriteHeader(http.StatusAccepted)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, stub
}

// upstreamSeen is what a stub provider received.
type upstreamSeen struct {
	mu      sync.Mutex
	headers []http.Header
	queries []string
}

func (u *upstreamSeen) count() int {
	u.mu.Lock()
	defer u.mu.Unlock()
	return len(u.headers)
}

func (u *upstreamSeen) last() (http.Header, string) {
	u.mu.Lock()
	defer u.mu.Unlock()
	return u.headers[len(u.headers)-1], u.queries[len(u.queries)-1]
}

// recordingUpstream is a provider that records each request and answers
// without usage, so no usage report runs after the response.
func recordingUpstream(t *testing.T) (*httptest.Server, *upstreamSeen) {
	t.Helper()
	seen := &upstreamSeen{}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		seen.mu.Lock()
		seen.headers = append(seen.headers, r.Header.Clone())
		seen.queries = append(seen.queries, r.URL.RawQuery)
		seen.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"choices":[{"message":{"content":"ok"}}]}`))
	}))
	t.Cleanup(srv.Close)
	return srv, seen
}

// pointProviderAt redirects one provider's base URL at a stub for a test.
func pointProviderAt(t *testing.T, name, baseURL string) {
	t.Helper()
	original := providers[name]
	replacement := original
	replacement.BaseURL = baseURL
	providers[name] = replacement
	t.Cleanup(func() { providers[name] = original })
}

func proxyRequest(gw *Gateway, path, agentKey string, headers map[string]string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"model":"test-model"}`))
	req.Header.Set("X-Zentinelle-Key", agentKey)
	req.Header.Set("Content-Type", "application/json")
	for name, value := range headers {
		req.Header.Set(name, value)
	}
	w := httptest.NewRecorder()
	gw.ServeHTTP(w, req)
	return w
}

func storedKeyConfig(zentinelleURL string) *Config {
	return &Config{
		ZentinelleURL:     zentinelleURL,
		PolicyTimeout:     5 * time.Second,
		MaxResponseBytes:  1 << 20,
		GatewayCredential: testGatewayCredential,
	}
}

// --- the acceptance criteria ---

func TestEachTenantIsServedOnItsOwnStoredKey(t *testing.T) {
	control, _ := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"openai": "sk-stored-tenant-a"},
		"sk_agent_tenant_b": {"openai": "sk-stored-tenant-b"},
	})
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	// An env key with the fallback on, to show a stored key still wins.
	cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
	cfg.AllowEnvProviderKeys = true
	gw := NewGateway(cfg)

	for agent, want := range map[string]string{
		"sk_agent_tenant_a": "Bearer sk-stored-tenant-a",
		"sk_agent_tenant_b": "Bearer sk-stored-tenant-b",
	} {
		w := proxyRequest(gw, "/v1/chat/completions", agent, nil)
		if w.Code != http.StatusOK {
			t.Fatalf("%s: status = %d, body = %s", agent, w.Code, w.Body.String())
		}
		headers, _ := seen.last()
		if got := headers.Get("Authorization"); got != want {
			t.Errorf("%s reached the provider with %q, want its own tenant's key %q", agent, got, want)
		}
	}
}

func TestAClientSuppliedKeyIsReplacedNotForwarded(t *testing.T) {
	control, _ := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"anthropic": "sk-ant-stored-tenant-a"},
	})
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "anthropic", upstream.URL)
	gw := NewGateway(storedKeyConfig(control.URL))

	w := proxyRequest(gw, "/v1/messages?key=client-query-key&beta=true", "sk_agent_tenant_a", map[string]string{
		"x-api-key":         "client-anthropic-key",
		"Authorization":     "Bearer client-bearer-token",
		"x-goog-api-key":    "client-google-key",
		"anthropic-version": "2023-06-01",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}

	headers, query := seen.last()
	if got := headers.Get("x-api-key"); got != "sk-ant-stored-tenant-a" {
		t.Errorf("x-api-key upstream = %q, want the tenant's stored key", got)
	}
	for name, values := range headers {
		for _, value := range values {
			if strings.Contains(value, "client-") {
				t.Errorf("client credential forwarded upstream in %s: %q", name, value)
			}
		}
	}
	if query != "beta=true" {
		t.Errorf("upstream query = %q, want the client's key parameter dropped and the rest kept", query)
	}
	if headers.Get("anthropic-version") != "2023-06-01" {
		t.Error("an ordinary provider header was dropped along with the credentials")
	}
}

func TestEveryProviderAuthHeaderIsDroppedFromClients(t *testing.T) {
	// A provider added to the table with an auth header of its own would
	// otherwise have a client-supplied key forwarded beside the injected one.
	for name, p := range providers {
		if ShouldForwardHeader(p.AuthHeader) {
			t.Errorf("provider %s authenticates with %s, which is forwarded from clients", name, p.AuthHeader)
		}
	}
}

func TestClientCredentialsAreDroppedOnTheEnvFallbackToo(t *testing.T) {
	// Stripping does not depend on a stored key existing.
	control, _ := controlPlaneStub(t, nil)
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
	cfg.AllowEnvProviderKeys = true
	gw := NewGateway(cfg)

	w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", map[string]string{
		"Authorization": "Bearer client-bearer-token",
		"x-api-key":     "client-api-key",
	})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	headers, _ := seen.last()
	if got := headers.Get("Authorization"); got != "Bearer sk-env-gateway" {
		t.Errorf("Authorization upstream = %q, want the gateway's env key", got)
	}
	if got := headers.Get("x-api-key"); got != "" {
		t.Errorf("client x-api-key forwarded upstream: %q", got)
	}
}

// --- the lookup ---

func TestTheLookupCarriesTheAgentKeyAndTheGatewayCredential(t *testing.T) {
	control, stub := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"openai": "sk-stored-tenant-a"},
	})
	upstream, _ := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)
	cfg := storedKeyConfig(control.URL)
	cfg.TenantID, cfg.ClusterID = "acme-corp", "prod-us-east-1"

	proxyRequest(NewGateway(cfg), "/v1/chat/completions", "sk_agent_tenant_a", nil)

	stub.mu.Lock()
	defer stub.mu.Unlock()
	if got := stub.headers.Get("X-Zentinelle-Key"); got != "sk_agent_tenant_a" {
		t.Errorf("lookup agent key = %q, want the request's", got)
	}
	if got := stub.headers.Get("X-Zentinelle-Gateway-Credential"); got != testGatewayCredential {
		t.Errorf("lookup gateway credential = %q, want the configured one", got)
	}
	if stub.body["provider"] != "openai" {
		t.Errorf("lookup provider = %q, want openai", stub.body["provider"])
	}
	if stub.headers.Get("X-Zentinelle-Tenant") != "acme-corp" || stub.headers.Get("X-Zentinelle-Cluster") != "prod-us-east-1" {
		t.Error("the lookup did not carry the gateway's identity headers")
	}
}

func TestAStoredKeyIsCachedPerAgentAndProvider(t *testing.T) {
	control, stub := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"openai": "sk-stored-a", "anthropic": "sk-ant-stored-a"},
		"sk_agent_tenant_b": {"openai": "sk-stored-b"},
	})
	upstream, _ := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)
	pointProviderAt(t, "anthropic", upstream.URL)
	gw := NewGateway(storedKeyConfig(control.URL))

	steps := []struct {
		path, agent string
		lookups     int
	}{
		{"/v1/chat/completions", "sk_agent_tenant_a", 1},
		{"/v1/chat/completions", "sk_agent_tenant_a", 1}, // cached
		{"/v1/chat/completions", "sk_agent_tenant_b", 2}, // another agent
		{"/v1/messages", "sk_agent_tenant_a", 3},         // another provider
		{"/v1/messages", "sk_agent_tenant_a", 3},         // cached
	}
	for i, step := range steps {
		if w := proxyRequest(gw, step.path, step.agent, nil); w.Code != http.StatusOK {
			t.Fatalf("step %d: status = %d, body = %s", i, w.Code, w.Body.String())
		}
		if got := stub.callCount(); got != step.lookups {
			t.Errorf("step %d: %d lookups, want %d", i, got, step.lookups)
		}
	}
}

func TestANoKeyAnswerIsCachedAndServedFromTheFallback(t *testing.T) {
	control, stub := controlPlaneStub(t, nil)
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
	cfg.AllowEnvProviderKeys = true
	gw := NewGateway(cfg)

	for i := 0; i < 2; i++ {
		if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_single", nil); w.Code != http.StatusOK {
			t.Fatalf("request %d: status = %d, body = %s", i, w.Code, w.Body.String())
		}
	}
	headers, _ := seen.last()
	if got := headers.Get("Authorization"); got != "Bearer sk-env-gateway" {
		t.Errorf("Authorization upstream = %q, want the env fallback", got)
	}
	if got := stub.callCount(); got != 1 {
		t.Errorf("%d lookups for two requests, want the no-key answer cached", got)
	}
}

func TestWithoutTheFallbackNoStoredKeyIsARefusal(t *testing.T) {
	// The env key is configured, and ignored: nobody allowed it.
	control, _ := controlPlaneStub(t, nil)
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
	gw := NewGateway(cfg)

	w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", w.Code)
	}
	var body map[string]string
	json.Unmarshal(w.Body.Bytes(), &body)
	if body["error"] != "no_api_key" {
		t.Errorf("error = %q, want no_api_key", body["error"])
	}
	if seen.count() != 0 {
		t.Error("the provider was contacted with no key to send")
	}
}

func TestTheEnvFallbackNeedsNoLookupWithoutACredential(t *testing.T) {
	// The single-tenant deployment as it was before #380, opted into.
	control, stub := controlPlaneStub(t, nil)
	upstream, seen := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	gw := NewGateway(&Config{
		ZentinelleURL: control.URL, PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-env-gateway"}, AllowEnvProviderKeys: true,
	})

	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_single", nil); w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	headers, _ := seen.last()
	if got := headers.Get("Authorization"); got != "Bearer sk-env-gateway" {
		t.Errorf("Authorization upstream = %q, want the env key", got)
	}
	if stub.callCount() != 0 {
		t.Error("a gateway without a credential looked a stored key up")
	}
}

func TestAFailedLookupFailsClosedAndIsNotCached(t *testing.T) {
	// Not one of these is "the tenant has no key", so none may reach the env
	// fallback: that would serve a tenant on another account's key because
	// the control plane was down or the gateway misconfigured.
	for _, tc := range []struct {
		name   string
		status int
		body   string
	}{
		{"wrong gateway credential", http.StatusUnauthorized, `{"detail": "Invalid gateway credential"}`},
		{"lookup disabled", http.StatusForbidden, `{"detail": "not configured"}`},
		{"backend without the route", http.StatusNotFound, `<h1>Not Found</h1>`},
		{"backend error", http.StatusInternalServerError, `{"detail": "boom"}`},
		{"unreadable stored key", http.StatusServiceUnavailable, `{"error": "provider_key_unreadable"}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			control, stub := controlPlaneStub(t, nil)
			stub.mu.Lock()
			stub.failWith, stub.failBody = tc.status, tc.body
			stub.mu.Unlock()
			upstream, seen := recordingUpstream(t)
			pointProviderAt(t, "openai", upstream.URL)

			cfg := storedKeyConfig(control.URL)
			cfg.ProviderAPIKeys = map[string]string{"openai": "sk-env-gateway"}
			cfg.AllowEnvProviderKeys = true
			gw := NewGateway(cfg)

			for i := 0; i < 2; i++ {
				w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_tenant_a", nil)
				if w.Code != http.StatusBadGateway {
					t.Errorf("request %d: status = %d, want 502", i, w.Code)
				}
				var body map[string]string
				json.Unmarshal(w.Body.Bytes(), &body)
				if body["error"] != "provider_key_lookup_failed" {
					t.Errorf("request %d: error = %q, want provider_key_lookup_failed", i, body["error"])
				}
			}
			if seen.count() != 0 {
				t.Error("a failed lookup still reached the provider")
			}
			if got := stub.callCount(); got != 2 {
				t.Errorf("%d lookups for two requests, want a failure never cached", got)
			}
		})
	}
}

func TestAnUnreachableControlPlaneFailsTheLookupClosed(t *testing.T) {
	cfg := &Config{ZentinelleURL: "http://127.0.0.1:1", PolicyTimeout: 200 * time.Millisecond}
	if _, _, err := LookupProviderKey(context.Background(), cfg, testGatewayCredential, "sk_agent_x", "openai"); err == nil {
		t.Error("an unreachable control plane was not reported as a failed lookup")
	}
}

// --- the cache ---

func TestACachedKeyExpiresAfterItsTTL(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	cache := newProviderKeyCache(time.Minute, 10)
	cache.now = func() time.Time { return now }

	cache.put("sk_agent_a", "openai", "sk-stored", true)

	now = now.Add(59 * time.Second)
	if key, found, ok := cache.get("sk_agent_a", "openai"); !ok || !found || key != "sk-stored" {
		t.Errorf("inside the TTL: get = %q/%v/%v, want the cached key", key, found, ok)
	}
	if _, _, ok := cache.get("sk_agent_b", "openai"); ok {
		t.Error("an entry was served to a different agent key")
	}

	now = now.Add(time.Second)
	if _, _, ok := cache.get("sk_agent_a", "openai"); ok {
		t.Error("an entry was served at its TTL")
	}
}

func TestTheCacheIsBounded(t *testing.T) {
	now := time.Unix(1_700_000_000, 0)
	cache := newProviderKeyCache(time.Minute, 5)
	cache.now = func() time.Time { return now }

	for i := 0; i < 12; i++ {
		cache.put("sk_agent_"+string(rune('a'+i)), "openai", "k", true)
	}
	cache.mu.Lock()
	held := len(cache.entries)
	cache.mu.Unlock()
	if held > 5 {
		t.Errorf("%d entries held, want at most 5", held)
	}
	if _, _, ok := cache.get("sk_agent_l", "openai"); !ok {
		t.Error("the entry just stored was evicted to make room for itself")
	}

	// Expired entries go first: after the TTL, a full cache of stale entries
	// makes room without touching a live one.
	now = now.Add(2 * time.Minute)
	cache.put("sk_agent_live", "openai", "k", true)
	cache.mu.Lock()
	held = len(cache.entries)
	cache.mu.Unlock()
	if held != 1 {
		t.Errorf("%d entries after the rest expired, want only the live one", held)
	}
}

// --- what is logged ---

// captureLogs routes the gateway's log lines into a buffer for one test.
func captureLogs(t *testing.T) func() string {
	t.Helper()
	var buf bytes.Buffer
	logOutput.Lock()
	previous := logOutput.w
	logOutput.w = &buf
	logOutput.Unlock()
	t.Cleanup(func() {
		logOutput.Lock()
		logOutput.w = previous
		logOutput.Unlock()
	})
	return func() string {
		logOutput.Lock()
		defer logOutput.Unlock()
		return buf.String()
	}
}

func TestNoKeyOrCredentialIsEverLogged(t *testing.T) {
	t.Setenv("LOG_INTERACTIONS", "")
	logs := captureLogs(t)

	control, stub := controlPlaneStub(t, map[string]map[string]string{
		"sk_agent_tenant_a": {"google": "stored-google-key-a"},
	})
	upstream, _ := recordingUpstream(t)
	pointProviderAt(t, "google", upstream.URL)
	gw := NewGateway(storedKeyConfig(control.URL))

	// A request served on the stored key, carrying client credentials in a
	// header and in the query string.
	w := proxyRequest(gw, "/v1beta/models/gemini:generateContent?key=client-query-key", "sk_agent_tenant_a",
		map[string]string{"x-goog-api-key": "client-header-key"})
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", w.Code, w.Body.String())
	}
	// And one whose lookup fails, so the failure path logs too.
	stub.mu.Lock()
	stub.failWith, stub.failBody = http.StatusInternalServerError, `{"echo": "`+testGatewayCredential+`"}`
	stub.mu.Unlock()
	proxyRequest(gw, "/v1beta/models/gemini:generateContent", "sk_agent_other", nil)

	logged := logs()
	if !strings.Contains(logged, `"key_source":"tenant"`) || !strings.Contains(logged, "provider_key_lookup_failed") {
		t.Fatalf("the requests were not logged, so this test proves nothing: %s", logged)
	}
	for _, secret := range []string{"stored-google-key-a", "client-query-key", "client-header-key", testGatewayCredential} {
		if strings.Contains(logged, secret) {
			t.Errorf("%q appears in the gateway's logs", secret)
		}
	}
}

// --- health and startup ---

func TestHealthListsEnvProvidersOnlyWhenTheFallbackIsOn(t *testing.T) {
	for _, allow := range []bool{false, true} {
		gw := NewGateway(&Config{
			ProviderAPIKeys:      map[string]string{"openai": "sk-env"},
			AllowEnvProviderKeys: allow,
			GatewayCredential:    testGatewayCredential,
		})
		w := httptest.NewRecorder()
		gw.ServeHTTP(w, httptest.NewRequest(http.MethodGet, "/health", nil))

		var body struct {
			Providers []string `json:"providers"`
		}
		json.Unmarshal(w.Body.Bytes(), &body)
		if want := map[bool]int{false: 0, true: 1}[allow]; len(body.Providers) != want {
			t.Errorf("fallback=%v: health lists %v, want %d env providers", allow, body.Providers, want)
		}
	}
}

func TestLoadConfigRefusesToStartWithNoKeySource(t *testing.T) {
	// Env keys without the flag are not a source: they would be ignored, and
	// the gateway would start cleanly and refuse every request.
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", "")
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL_FILE", "")
	t.Setenv("ALLOW_ENV_PROVIDER_KEYS", "")
	t.Setenv("OPENAI_API_KEY", "sk-env")

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), "no provider key source") {
		t.Errorf("err = %v, want a refusal naming the missing key source", err)
	}
}

func TestLoadConfigRefusesAFallbackWithNoKeys(t *testing.T) {
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", "")
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL_FILE", "")
	t.Setenv("ALLOW_ENV_PROVIDER_KEYS", "true")
	for _, name := range []string{"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY"} {
		t.Setenv(name, "")
	}

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), "no provider key source") {
		t.Errorf("err = %v, want a refusal naming the missing key source", err)
	}
}

func TestLoadConfigRejectsAValueThatIsNotAGatewayCredential(t *testing.T) {
	// An agent key pasted into the wrong variable, caught before it is sent.
	for _, value := range []string{"sk_agent_0123456789abcdefghijklmnop", "sk_gateway_short", "replace-me"} {
		t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", value)

		_, err := LoadConfig()
		if err == nil || !strings.Contains(err.Error(), "ZENTINELLE_GATEWAY_CREDENTIAL") {
			t.Errorf("%q: err = %v, want it refused as not a gateway credential", value, err)
		}
		if err != nil && strings.Contains(err.Error(), value) {
			t.Errorf("%q: the error echoed the value", value)
		}
	}
}

func TestLoadConfigRejectsAnUnparseableFallbackFlag(t *testing.T) {
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", testGatewayCredential)
	t.Setenv("ALLOW_ENV_PROVIDER_KEYS", "yes-please")

	_, err := LoadConfig()
	if err == nil || !strings.Contains(err.Error(), "ALLOW_ENV_PROVIDER_KEYS") {
		t.Errorf("err = %v, want the flag refused rather than guessed", err)
	}
}

func TestWithoutKeyParamDropsOnlyTheKey(t *testing.T) {
	for raw, want := range map[string]string{
		"":                            "",
		"key=secret":                  "",
		"alt=sse&key=secret":          "alt=sse",
		"key=secret&alt=sse&b=%2F":    "alt=sse&b=%2F",
		"%6Bey=secret&x=1":            "x=1",
		"keys=1&apikey=2&key":         "keys=1&apikey=2",
		"a=1&key=one&b=2&key=two&c=3": "a=1&b=2&c=3",
	} {
		if got := withoutKeyParam(raw); got != want {
			t.Errorf("withoutKeyParam(%q) = %q, want %q", raw, got, want)
		}
	}
}
