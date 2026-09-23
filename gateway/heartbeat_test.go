package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

// recordedBeat is one heartbeat as the control plane received it.
type recordedBeat struct {
	method, path, credential, cluster, contentType string
	body                                           map[string]interface{}
}

// clusterControlPlane stands in for Zentinelle with an Astrolift cluster
// registered for this gateway. /evaluate allows every agent key except
// sk_agent_denied (denied) and sk_agent_unknown (refused with a 401), unless a
// test sets evaluateStatus. The provider-key lookup has a key for every agent,
// unless a test sets lookupStatus.
// A heartbeat is recorded, then answered with the next of statuses while any
// remain, and after that with an acknowledgement for the accepted credential
// and a 401 for any other.
type clusterControlPlane struct {
	mu             sync.Mutex
	accepted       string
	statuses       []int
	next           int64
	evaluateStatus int
	lookupStatus   int
	beats          []recordedBeat
}

// set changes the stub under its lock: its handler reads it on the server's goroutines.
func (cp *clusterControlPlane) set(change func()) {
	cp.mu.Lock()
	defer cp.mu.Unlock()
	change()
}

func (cp *clusterControlPlane) recorded() []recordedBeat {
	cp.mu.Lock()
	defer cp.mu.Unlock()
	return append([]recordedBeat(nil), cp.beats...)
}

func newClusterControlPlane(t *testing.T) (*httptest.Server, *clusterControlPlane) {
	t.Helper()
	cp := &clusterControlPlane{accepted: testGatewayCredential, next: 60}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		cp.mu.Lock()
		defer cp.mu.Unlock()
		switch {
		case strings.HasSuffix(r.URL.Path, "/evaluate"):
			key := r.Header.Get("X-Zentinelle-Key")
			switch {
			case cp.evaluateStatus != 0:
				w.WriteHeader(cp.evaluateStatus)
			case key == "sk_agent_unknown":
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"detail": "Invalid API key"}`))
			default:
				fmt.Fprintf(w, `{"allowed": %t, "reason": "test"}`, key != "sk_agent_denied")
			}
		case strings.HasSuffix(r.URL.Path, "/gateway/provider-key"):
			if cp.lookupStatus != 0 {
				w.WriteHeader(cp.lookupStatus)
				return
			}
			w.Write([]byte(`{"provider": "openai", "api_key": "sk-stored"}`))
		case strings.HasSuffix(r.URL.Path, "/heartbeat"):
			var body map[string]interface{}
			json.NewDecoder(r.Body).Decode(&body)
			cp.beats = append(cp.beats, recordedBeat{
				method: r.Method, path: r.URL.EscapedPath(), body: body,
				credential:  r.Header.Get("X-Zentinelle-Gateway-Credential"),
				cluster:     r.Header.Get("X-Zentinelle-Cluster"),
				contentType: r.Header.Get("Content-Type"),
			})
			if len(cp.statuses) > 0 {
				status := cp.statuses[0]
				cp.statuses = cp.statuses[1:]
				w.WriteHeader(status)
				w.Write([]byte(`{"error": "scripted"}`))
				return
			}
			if r.Header.Get("X-Zentinelle-Gateway-Credential") != cp.accepted {
				w.WriteHeader(http.StatusUnauthorized)
				w.Write([]byte(`{"detail": "Invalid gateway credential"}`))
				return
			}
			fmt.Fprintf(w, `{"acknowledged": true, "next_heartbeat_seconds": %d}`, cp.next)
		default:
			w.WriteHeader(http.StatusAccepted)
		}
	}))
	t.Cleanup(srv.Close)
	return srv, cp
}

// heartbeatGateway is a gateway for cluster c1 behind a clusterControlPlane,
// with a provider that answers every request.
func heartbeatGateway(t *testing.T) (*Gateway, *clusterControlPlane) {
	t.Helper()
	control, cp := newClusterControlPlane(t)
	upstream, _ := recordingUpstream(t)
	pointProviderAt(t, "openai", upstream.URL)

	cfg := storedKeyConfig(control.URL)
	cfg.ClusterID = "c1"
	cfg.HeartbeatInterval = 45 * time.Second
	return NewGateway(cfg), cp
}

// driveHeartbeat runs gw's heartbeat loop with no jitter. Each wait is
// recorded and returns at once, after calling step with its number, and the
// loop ends at the wait numbered waits.
func driveHeartbeat(gw *Gateway, waits int, step func(n int)) []time.Duration {
	h := gw.newHeartbeat()
	h.jitter = func(d time.Duration) time.Duration { return d }
	var delays []time.Duration
	h.wait = func(_ context.Context, d time.Duration) bool {
		delays = append(delays, d)
		if len(delays) >= waits {
			return false
		}
		if step != nil {
			step(len(delays))
		}
		return true
	}
	h.run(context.Background())
	return delays
}

func sendBeat(t *testing.T, h *heartbeat) beatOutcome {
	t.Helper()
	outcome, err := h.beat(context.Background())
	if outcome == beatFailed {
		t.Logf("beat failed: %v", err)
	}
	return outcome
}

func counters(beat recordedBeat) map[string]interface{} {
	c, _ := beat.body["counters"].(map[string]interface{})
	return c
}

func TestAHeartbeatCarriesExactlyTheContractPayload(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	for _, key := range []string{"sk_agent_a", "sk_agent_a", "sk_agent_b", "sk_agent_denied", "sk_agent_unknown", ""} {
		proxyRequest(gw, "/v1/chat/completions", key, nil)
	}
	// The scraper's own traffic is not a request.
	for _, path := range []string{"/health", "/metrics"} {
		gw.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(http.MethodGet, path, nil))
	}

	if outcome := sendBeat(t, gw.newHeartbeat()); outcome != beatDelivered {
		t.Fatalf("outcome = %v, want delivered", outcome)
	}

	beats := cp.recorded()
	if len(beats) != 1 {
		t.Fatalf("%d heartbeats, want 1", len(beats))
	}
	beat := beats[0]
	if beat.method != http.MethodPost || beat.path != "/api/zentinelle/v1/astrolift/clusters/c1/heartbeat" {
		t.Errorf("sent %s %s", beat.method, beat.path)
	}
	if beat.credential != testGatewayCredential || beat.cluster != "c1" || beat.contentType != "application/json" {
		t.Errorf("headers: credential sent = %v, cluster = %q, content type = %q",
			beat.credential == testGatewayCredential, beat.cluster, beat.contentType)
	}
	// Six requests, one of them without a key. Blocked: the denial and the
	// key Zentinelle refused. Agents: the three keys Zentinelle decided on;
	// the refused one is not an agent it knows.
	want := map[string]interface{}{
		"status":   "healthy",
		"version":  "dev",
		"counters": map[string]interface{}{"requests": 6.0, "blocked": 2.0, "agents_seen": 3.0},
	}
	if !reflect.DeepEqual(beat.body, want) {
		t.Errorf("body = %v, want %v", beat.body, want)
	}
}

func TestTheHeartbeatSendsTheBuildVersion(t *testing.T) {
	original := version
	version = "1.4.2"
	t.Cleanup(func() { version = original })
	gw, cp := heartbeatGateway(t)

	sendBeat(t, gw.newHeartbeat())
	if got := cp.recorded()[0].body["version"]; got != "1.4.2" {
		t.Errorf("version = %v, want the one set at build time", got)
	}
}

func TestTheClusterIDIsEscapedInThePath(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	gw.cfg.ClusterID = "prod us/east"

	sendBeat(t, gw.newHeartbeat())
	if got := cp.recorded()[0].path; got != "/api/zentinelle/v1/astrolift/clusters/prod%20us%2Feast/heartbeat" {
		t.Errorf("path = %q", got)
	}
}

func TestCountersAreRunningTotalsThatABeatNeverResets(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	h := gw.newHeartbeat()

	proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil)
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_denied", nil)
	sendBeat(t, h)

	proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil)
	sendBeat(t, h)

	// A beat that fails loses nothing: the next one carries the same totals, grown.
	cp.set(func() { cp.statuses = []int{http.StatusServiceUnavailable} })
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_b", nil)
	if outcome := sendBeat(t, h); outcome != beatFailed {
		t.Fatalf("outcome = %v, want failed", outcome)
	}
	sendBeat(t, h)

	var got []map[string]interface{}
	for _, beat := range cp.recorded() {
		got = append(got, counters(beat))
	}
	want := []map[string]interface{}{
		{"requests": 2.0, "blocked": 1.0, "agents_seen": 2.0},
		{"requests": 3.0, "blocked": 1.0, "agents_seen": 2.0},
		{"requests": 4.0, "blocked": 1.0, "agents_seen": 3.0},
		{"requests": 4.0, "blocked": 1.0, "agents_seen": 3.0},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("counters by beat = %v, want %v", got, want)
	}
}

func TestAResponseWithheldByTheOutputFilterIsBlocked(t *testing.T) {
	upstream := upstreamStub(t, "application/json", `{"choices":[{"message":{"content":"the secret"}}]}`)
	defer upstream.Close()
	control, _ := zentinelleStub(t, true, false)
	defer control.Close()
	pointOpenAIAt(t, upstream.URL)
	gw := NewGateway(&Config{
		ZentinelleURL: control.URL, PolicyTimeout: 5 * time.Second, MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{"openai": "sk-test"}, AllowEnvProviderKeys: true,
	})

	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil); w.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want the response withheld", w.Code)
	}
	if got := gw.stats.snapshot(); got.requests != 1 || got.blocked != 1 {
		t.Errorf("requests = %d, blocked = %d; want 1 and 1", got.requests, got.blocked)
	}
}

func TestStatusIsJudgedFromTheGatewaysOwnCallsSinceTheLastDeliveredBeat(t *testing.T) {
	cases := []struct {
		name     string
		from, to statsSnapshot
		want     string
	}{
		{"no calls at all", statsSnapshot{}, statsSnapshot{}, "healthy"},
		{"every call answered", statsSnapshot{}, statsSnapshot{checksAnswered: 9, lookupsAnswered: 3}, "healthy"},
		{"some checks unanswered", statsSnapshot{}, statsSnapshot{checksAnswered: 9, checksUnanswered: 1}, "degraded"},
		{"some lookups failed", statsSnapshot{}, statsSnapshot{checksAnswered: 9, lookupsAnswered: 2, lookupsFailed: 1}, "degraded"},
		{"every check unanswered", statsSnapshot{}, statsSnapshot{checksUnanswered: 4}, "unhealthy"},
		{"every lookup failed", statsSnapshot{}, statsSnapshot{checksAnswered: 9, lookupsFailed: 2}, "unhealthy"},
		{"failures before the window",
			statsSnapshot{checksUnanswered: 4, lookupsFailed: 2},
			statsSnapshot{checksAnswered: 5, checksUnanswered: 4, lookupsAnswered: 1, lookupsFailed: 2}, "healthy"},
	}
	for _, c := range cases {
		if got := heartbeatStatus(c.from, c.to); got != c.want {
			t.Errorf("%s: status = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestStatusFollowsZentinellesAnswersThroughTheProxy(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	h := gw.newHeartbeat()
	status := func() string {
		sendBeat(t, h)
		beats := cp.recorded()
		return beats[len(beats)-1].body["status"].(string)
	}

	// Zentinelle failing every policy check: the gateway blocks everything.
	cp.set(func() { cp.evaluateStatus = http.StatusServiceUnavailable })
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil)
	if got := status(); got != "unhealthy" {
		t.Errorf("status = %q with every policy check failing, want unhealthy", got)
	}

	// Recovered, but with a failure left in the same window.
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil)
	cp.set(func() { cp.evaluateStatus = 0 })
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil)
	if got := status(); got != "degraded" {
		t.Errorf("status = %q with some checks failing, want degraded", got)
	}

	// An agent key Zentinelle refuses is that agent's problem, not the gateway's.
	proxyRequest(gw, "/v1/chat/completions", "sk_agent_unknown", nil)
	if got := status(); got != "healthy" {
		t.Errorf("status = %q after a refused agent key, want healthy", got)
	}

	// Nor is a client that went away mid-check.
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader(`{"model":"m"}`)).WithContext(ctx)
	req.Header.Set("X-Zentinelle-Key", "sk_agent_a")
	gw.ServeHTTP(httptest.NewRecorder(), req)
	if got := status(); got != "healthy" {
		t.Errorf("status = %q after a client went away, want healthy", got)
	}
}

func TestAFailingProviderKeyLookupMakesTheGatewayUnhealthy(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	cp.set(func() { cp.lookupStatus = http.StatusBadGateway })

	if w := proxyRequest(gw, "/v1/chat/completions", "sk_agent_a", nil); w.Code != http.StatusBadGateway {
		t.Fatalf("status = %d, want 502 from the failed lookup", w.Code)
	}
	sendBeat(t, gw.newHeartbeat())
	if got := cp.recorded()[0].body["status"]; got != "unhealthy" {
		t.Errorf("status = %v with every lookup failing, want unhealthy", got)
	}

	// A lookup whose client went away is not counted.
	gone, cancel := context.WithCancel(context.Background())
	cancel()
	before := gw.stats.snapshot()
	gw.stats.lookedUp(gone, context.Canceled)
	if gw.stats.snapshot() != before {
		t.Error("a lookup abandoned by its client was counted")
	}
}

func TestCheckPolicyReportsHowZentinelleAnswered(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		want   policyOutcome
	}{
		{"allowed", http.StatusOK, `{"allowed": true}`, policyDecided},
		{"denied", http.StatusOK, `{"allowed": false, "reason": "no"}`, policyDecided},
		{"unknown key", http.StatusUnauthorized, `{"detail": "Invalid API key"}`, policyRefused},
		{"forbidden", http.StatusForbidden, `{}`, policyRefused},
		{"server error", http.StatusServiceUnavailable, ``, policyUnanswered},
		{"unreadable", http.StatusOK, `<html>`, policyUnanswered},
	}
	for _, c := range cases {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(c.status)
			w.Write([]byte(c.body))
		}))
		result := CheckPolicy(context.Background(), &Config{ZentinelleURL: srv.URL, PolicyTimeout: 5 * time.Second}, "sk_agent_a", "openai", "m")
		srv.Close()
		if result.outcome != c.want {
			t.Errorf("%s: outcome = %v, want %v", c.name, result.outcome, c.want)
		}
	}

	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	if result := CheckPolicy(context.Background(), &Config{ZentinelleURL: closed.URL, PolicyTimeout: time.Second}, "sk_agent_a", "openai", "m"); result.outcome != policyUnanswered {
		t.Errorf("unreachable: outcome = %v, want unanswered", result.outcome)
	}
}

func TestAgentsSeenCountsDistinctKeysUpToItsBound(t *testing.T) {
	logs := captureLogs(t)
	stats := newGatewayStats(3)
	for _, key := range []string{"sk_agent_a", "sk_agent_a", "sk_agent_b"} {
		stats.agents.add(key)
	}
	if got := stats.agents.count(); got != 2 {
		t.Errorf("agents_seen = %d, want 2 distinct", got)
	}
	for _, key := range []string{"sk_agent_c", "sk_agent_d", "sk_agent_e"} {
		stats.agents.add(key)
	}
	if got := stats.agents.count(); got != 3 {
		t.Errorf("agents_seen = %d, want it held at its bound of 3", got)
	}
	if got := strings.Count(logs(), "agents_seen reached its bound"); got != 1 {
		t.Errorf("the bound was logged %d times, want once", got)
	}
}

func TestTheHeartbeatSendsAtStartAndThenAsOftenAsZentinelleAsks(t *testing.T) {
	cases := []struct {
		name string
		next int64
		want []time.Duration
	}{
		{"the answer's interval", 30, []time.Duration{30 * time.Second, 30 * time.Second}},
		{"no interval in the answer keeps the configured one", 0, []time.Duration{45 * time.Second, 45 * time.Second}},
		{"too short is raised to the floor", 1, []time.Duration{10 * time.Second, 10 * time.Second}},
		{"too long is cut to an hour", 100000, []time.Duration{time.Hour, time.Hour}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			gw, cp := heartbeatGateway(t)
			cp.set(func() { cp.next = c.next })
			sentBeforeWaiting := 0
			delays := driveHeartbeat(gw, 2, func(n int) {
				if n == 1 {
					sentBeforeWaiting = len(cp.recorded())
				}
			})
			if sentBeforeWaiting != 1 {
				t.Errorf("%d heartbeats before the first wait, want one sent at start", sentBeforeWaiting)
			}
			if !reflect.DeepEqual(delays, c.want) {
				t.Errorf("waits = %v, want %v", delays, c.want)
			}
		})
	}
}

func TestAFailingHeartbeatBacksOffExponentiallyUpToACap(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	cp.set(func() { cp.statuses = []int{503, 503, 503, 503, 503, 503, 503} })

	delays := driveHeartbeat(gw, 8, nil)
	want := []time.Duration{
		10 * time.Second, 20 * time.Second, 40 * time.Second, 80 * time.Second,
		160 * time.Second, 5 * time.Minute, 5 * time.Minute,
		60 * time.Second, // delivered: back to the interval Zentinelle asked for
	}
	if !reflect.DeepEqual(delays, want) {
		t.Errorf("waits = %v, want %v", delays, want)
	}
	if got := heartbeatBackoff(1000); got != maxHeartbeatBackoff {
		t.Errorf("backoff after 1000 failures = %v, want the cap", got)
	}
}

func TestAnUnreachableOrUnacknowledgingZentinelleIsAFailedBeat(t *testing.T) {
	gw, _ := heartbeatGateway(t)
	closed := httptest.NewServer(http.NotFoundHandler())
	closed.Close()
	gw.cfg.ZentinelleURL = closed.URL
	if delays := driveHeartbeat(gw, 1, nil); !reflect.DeepEqual(delays, []time.Duration{10 * time.Second}) {
		t.Errorf("waits = %v, want a 10s retry", delays)
	}

	// A 200 that is not Zentinelle's acknowledgement, from a proxy in the way,
	// is not a delivered beat.
	proxy := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`<html>welcome</html>`))
	}))
	defer proxy.Close()
	gw.cfg.ZentinelleURL = proxy.URL
	if outcome := sendBeat(t, gw.newHeartbeat()); outcome != beatFailed {
		t.Errorf("an unacknowledged 200: outcome = %v, want failed", outcome)
	}

	// Nor is a redirect, which is never followed: the credential would go
	// along to wherever it pointed.
	var reached sync.Mutex
	elsewhereHit := false
	elsewhere := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reached.Lock()
		elsewhereHit = true
		reached.Unlock()
		w.Write([]byte(`{"acknowledged": true, "next_heartbeat_seconds": 60}`))
	}))
	defer elsewhere.Close()
	redirecting := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, elsewhere.URL+r.URL.Path, http.StatusTemporaryRedirect)
	}))
	defer redirecting.Close()
	gw.cfg.ZentinelleURL = redirecting.URL
	if outcome := sendBeat(t, gw.newHeartbeat()); outcome != beatFailed {
		t.Errorf("a redirect: outcome = %v, want failed", outcome)
	}
	reached.Lock()
	defer reached.Unlock()
	if elsewhereHit {
		t.Error("the redirect was followed")
	}
}

func TestJitterStaysWithinATenthEitherWay(t *testing.T) {
	seen := map[time.Duration]bool{}
	for i := 0; i < 1000; i++ {
		d := jitter(time.Minute)
		if d < 54*time.Second || d > 66*time.Second {
			t.Fatalf("jitter(1m) = %v, outside 54s..66s", d)
		}
		seen[d] = true
	}
	if len(seen) < 100 {
		t.Errorf("jitter(1m) gave %d distinct values in 1000 draws", len(seen))
	}
}

func TestNoHeartbeatWithoutAClusterACredentialSourceOrAnInterval(t *testing.T) {
	control, cp := newClusterControlPlane(t)
	base := Config{ZentinelleURL: control.URL, ClusterID: "c1", HeartbeatInterval: time.Minute, GatewayCredential: testGatewayCredential}

	noCluster, noCredential, off := base, base, base
	noCluster.ClusterID = ""
	noCredential.GatewayCredential = ""
	off.HeartbeatInterval = 0
	for name, cfg := range map[string]Config{"no cluster id": noCluster, "no credential": noCredential, "interval 0": off} {
		gw := NewGateway(&cfg)
		ctx, cancel := context.WithCancel(context.Background())
		select {
		case <-gw.startHeartbeat(ctx):
		case <-time.After(time.Second):
			t.Errorf("%s: the heartbeat started", name)
		}
		cancel()
	}
	if n := len(cp.recorded()); n != 0 {
		t.Errorf("%d heartbeats sent, want none", n)
	}

	fileOnly := base
	fileOnly.GatewayCredential, fileOnly.GatewayCredentialFile = "", "/var/run/zentinelle/gateway-credential"
	if !heartbeatEnabled(&base) || !heartbeatEnabled(&fileOnly) {
		t.Error("a gateway with a cluster and a credential source must report")
	}
}

func TestACredentialFileThatAppearsLaterStartsTheHeartbeat(t *testing.T) {
	gw, cp := heartbeatGateway(t)
	path := filepath.Join(t.TempDir(), "gateway-credential")
	gw.credential = newGatewayCredential("", path)
	gw.cfg.GatewayCredential, gw.cfg.GatewayCredentialFile = "", path
	clock := time.Unix(1_700_000_000, 0)
	gw.credential.now = func() time.Time { return clock }

	delays := driveHeartbeat(gw, 2, func(n int) {
		if n == 1 {
			if len(cp.recorded()) != 0 {
				t.Error("a heartbeat was sent with no credential")
			}
			writeCredentialFile(t, path, testGatewayCredential)
			clock = clock.Add(gatewayCredentialRereadInterval)
		}
	})
	if beats := cp.recorded(); len(beats) != 1 || beats[0].credential != testGatewayCredential {
		t.Errorf("heartbeats = %d, want one with the credential from the file", len(beats))
	}
	if !reflect.DeepEqual(delays, []time.Duration{45 * time.Second, 60 * time.Second}) {
		t.Errorf("waits = %v", delays)
	}
}

func TestARefusedHeartbeatRereadsTheCredentialFileAndRetriesOnce(t *testing.T) {
	for _, refusal := range []int{http.StatusUnauthorized, http.StatusForbidden} {
		t.Run(http.StatusText(refusal), func(t *testing.T) {
			gw, cp := heartbeatGateway(t)
			path := filepath.Join(t.TempDir(), "gateway-credential")
			writeCredentialFile(t, path, rotatedCredential)
			gw.credential = newGatewayCredential(testGatewayCredential, path)
			cp.set(func() { cp.statuses, cp.accepted = []int{refusal}, rotatedCredential })

			if outcome := sendBeat(t, gw.newHeartbeat()); outcome != beatDelivered {
				t.Fatalf("outcome = %v, want delivered with the rotated credential", outcome)
			}
			beats := cp.recorded()
			if len(beats) != 2 || beats[0].credential != testGatewayCredential || beats[1].credential != rotatedCredential {
				t.Errorf("%d heartbeats, want the refused one and one retry with the rotated credential", len(beats))
			}
		})
	}

	// The file holds the same credential: nothing to retry with.
	gw, cp := heartbeatGateway(t)
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, testGatewayCredential)
	gw.credential = newGatewayCredential(testGatewayCredential, path)
	cp.set(func() { cp.accepted = rotatedCredential })
	outcome, err := gw.newHeartbeat().beat(context.Background())
	if outcome != beatFailed || err == nil || !strings.Contains(err.Error(), "refused the gateway credential (status 401)") {
		t.Errorf("outcome = %v, %v; want a failed beat naming the refusal", outcome, err)
	}
	if n := len(cp.recorded()); n != 1 {
		t.Errorf("%d heartbeats, want 1", n)
	}
}

func TestANotFoundStopsTheHeartbeatUntilTheCredentialChanges(t *testing.T) {
	logs := captureLogs(t)
	gw, cp := heartbeatGateway(t)
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, testGatewayCredential)
	gw.credential = newGatewayCredential(testGatewayCredential, path)
	clock := time.Unix(1_700_000_000, 0)
	gw.credential.now = func() time.Time { return clock }
	cp.set(func() { cp.statuses, cp.accepted = []int{http.StatusNotFound}, rotatedCredential })

	delays := driveHeartbeat(gw, 3, func(n int) {
		clock = clock.Add(gatewayCredentialRereadInterval)
		if n <= 2 && len(cp.recorded()) != 1 {
			t.Errorf("wait %d: %d heartbeats sent while stopped, want only the one refused", n, len(cp.recorded()))
		}
		if n == 2 {
			// Astrolift registers the cluster again and writes the new
			// credential, and a refused provider-key lookup reads it before
			// the heartbeat looks.
			writeCredentialFile(t, path, rotatedCredential)
			gw.credential.reread()
			clock = clock.Add(gatewayCredentialRereadInterval)
		}
	})

	beats := cp.recorded()
	if len(beats) != 2 || beats[1].credential != rotatedCredential {
		t.Errorf("%d heartbeats, want the refused one and one with the new credential", len(beats))
	}
	if !reflect.DeepEqual(delays, []time.Duration{45 * time.Second, 45 * time.Second, 60 * time.Second}) {
		t.Errorf("waits = %v", delays)
	}
	logged := logs()
	if strings.Count(logged, "cluster heartbeat stopped") != 1 || strings.Count(logged, "cluster heartbeat resumed") != 1 {
		t.Errorf("want the stop and the resume logged once each: %s", logged)
	}
}

func TestANotFoundEndsTheHeartbeatForACredentialFromTheEnvironment(t *testing.T) {
	gw, cp := heartbeatGateway(t) // credential from the environment, no file
	cp.set(func() { cp.statuses = []int{http.StatusNotFound} })

	if delays := driveHeartbeat(gw, 5, nil); len(delays) != 0 {
		t.Errorf("waits = %v, want the loop to end at once", delays)
	}
	if n := len(cp.recorded()); n != 1 {
		t.Errorf("%d heartbeats, want 1", n)
	}
}

func TestTheHeartbeatStopsOnShutdown(t *testing.T) {
	t.Run("while waiting", func(t *testing.T) {
		gw, cp := heartbeatGateway(t)
		cp.set(func() { cp.next = 3600 })
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		done := gw.startHeartbeat(ctx)

		deadline := time.Now().Add(5 * time.Second)
		for len(cp.recorded()) == 0 && time.Now().Before(deadline) {
			time.Sleep(10 * time.Millisecond)
		}
		if len(cp.recorded()) != 1 {
			t.Fatal("no heartbeat at start")
		}
		cancel()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("the heartbeat did not stop")
		}
	})

	t.Run("mid-request", func(t *testing.T) {
		inFlight, release := make(chan struct{}, 1), make(chan struct{})
		control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Read to the end, so the server notices when the client goes away.
			io.Copy(io.Discard, r.Body)
			inFlight <- struct{}{}
			select {
			case <-r.Context().Done():
			case <-release:
			}
		}))
		defer control.Close()
		defer close(release)
		cfg := storedKeyConfig(control.URL)
		cfg.ClusterID, cfg.HeartbeatInterval = "c1", time.Minute
		ctx, cancel := context.WithCancel(context.Background())
		defer cancel()
		done := NewGateway(cfg).startHeartbeat(ctx)

		select {
		case <-inFlight:
		case <-time.After(5 * time.Second):
			t.Fatal("no heartbeat at start")
		}
		cancel()
		select {
		case <-done:
		case <-time.After(2 * time.Second):
			t.Fatal("the heartbeat did not stop mid-request")
		}
	})
}

func TestTheHeartbeatNeverLogsACredentialOrAnAgentKey(t *testing.T) {
	logs := captureLogs(t)
	gw, cp := heartbeatGateway(t)
	gw.stats = newGatewayStats(1)
	path := filepath.Join(t.TempDir(), "gateway-credential")
	writeCredentialFile(t, path, rotatedCredential)
	gw.credential = newGatewayCredential(testGatewayCredential, path)
	for _, key := range []string{"sk_agent_a", "sk_agent_b", "sk_agent_unknown"} {
		proxyRequest(gw, "/v1/chat/completions", key, nil)
	}
	// Failed, then refused and retried with the rotated credential into a
	// 404, which stops it.
	cp.set(func() {
		cp.statuses = []int{http.StatusServiceUnavailable, http.StatusUnauthorized, http.StatusNotFound}
	})
	driveHeartbeat(gw, 3, nil)

	logged := logs()
	for _, message := range []string{"cluster heartbeat started", "cluster heartbeat failed", "cluster heartbeat stopped", "agents_seen reached its bound"} {
		if !strings.Contains(logged, message) {
			t.Fatalf("%q was not logged, so this test proves nothing: %s", message, logged)
		}
	}
	for _, secret := range []string{testGatewayCredential, rotatedCredential, "sk_agent_a", "sk_agent_b", "sk_agent_unknown", "sk-stored"} {
		if strings.Contains(logged, secret) {
			t.Errorf("%q appears in the gateway's logs", secret)
		}
	}
}

func TestHeartbeatIntervalFromTheEnvironment(t *testing.T) {
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", testGatewayCredential)
	for value, want := range map[string]time.Duration{
		"": time.Minute, "0": 0, "10": 10 * time.Second, "3600": time.Hour,
	} {
		t.Setenv("HEARTBEAT_INTERVAL_SECONDS", value)
		cfg, err := LoadConfig()
		if err != nil {
			t.Errorf("HEARTBEAT_INTERVAL_SECONDS=%q: %v", value, err)
			continue
		}
		if cfg.HeartbeatInterval != want {
			t.Errorf("HEARTBEAT_INTERVAL_SECONDS=%q gave %v, want %v", value, cfg.HeartbeatInterval, want)
		}
	}
	for _, value := range []string{"9", "-1", "3601", "sixty", "1.5", "99999999999999999"} {
		t.Setenv("HEARTBEAT_INTERVAL_SECONDS", value)
		if _, err := LoadConfig(); err == nil || !strings.Contains(err.Error(), "HEARTBEAT_INTERVAL_SECONDS") {
			t.Errorf("HEARTBEAT_INTERVAL_SECONDS=%q: err = %v, want it refused", value, err)
		}
	}
}
