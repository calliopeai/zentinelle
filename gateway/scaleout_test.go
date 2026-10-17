package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func TestLoadConfigDrainDefaultsAndOverrides(t *testing.T) {
	t.Setenv("ZENTINELLE_GATEWAY_CREDENTIAL", testGatewayCredential)
	for _, key := range []string{"SHUTDOWN_DELAY_SECONDS", "DRAIN_TIMEOUT_SECONDS", "METRICS_EMF_INTERVAL_SECONDS", "METRICS_EMF_NAMESPACE"} {
		t.Setenv(key, "")
	}
	cfg, err := LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ShutdownDelay != 5*time.Second || cfg.DrainTimeout != 20*time.Second {
		t.Errorf("delay %v drain %v, want 5s and 20s", cfg.ShutdownDelay, cfg.DrainTimeout)
	}
	if cfg.MetricsEMFInterval != 0 || cfg.MetricsEMFNamespace != "Zentinelle/Gateway" {
		t.Errorf("EMF interval %v namespace %q, want off and Zentinelle/Gateway", cfg.MetricsEMFInterval, cfg.MetricsEMFNamespace)
	}

	t.Setenv("SHUTDOWN_DELAY_SECONDS", "0")
	t.Setenv("DRAIN_TIMEOUT_SECONDS", "100")
	t.Setenv("METRICS_EMF_INTERVAL_SECONDS", "15")
	t.Setenv("METRICS_EMF_NAMESPACE", "Acme/Gateway")
	cfg, err = LoadConfig()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.ShutdownDelay != 0 || cfg.DrainTimeout != 100*time.Second ||
		cfg.MetricsEMFInterval != 15*time.Second || cfg.MetricsEMFNamespace != "Acme/Gateway" {
		t.Errorf("overrides not read: %+v", cfg)
	}

	for key, bad := range map[string]string{
		"SHUTDOWN_DELAY_SECONDS":       "-1",
		"DRAIN_TIMEOUT_SECONDS":        "0",
		"METRICS_EMF_INTERVAL_SECONDS": "soon",
	} {
		t.Run(key, func(t *testing.T) {
			t.Setenv(key, bad)
			if _, err := LoadConfig(); err == nil || !strings.Contains(err.Error(), key) {
				t.Errorf("%s=%s: err = %v, want a refusal naming it", key, bad, err)
			}
		})
	}
}

func TestReadyFailsWhileDrainingAndHealthDoesNot(t *testing.T) {
	gw := NewGateway(&Config{GatewayCredential: testGatewayCredential})

	get := func(path string) int {
		w := httptest.NewRecorder()
		gw.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w.Code
	}
	if code := get("/ready"); code != http.StatusOK {
		t.Fatalf("/ready = %d before draining, want 200", code)
	}
	gw.draining.Store(true)
	if code := get("/ready"); code != http.StatusServiceUnavailable {
		t.Errorf("/ready = %d while draining, want 503", code)
	}
	if code := get("/health"); code != http.StatusOK {
		t.Errorf("/health = %d while draining, want 200: a draining replica is not a dead one", code)
	}
}

// drainRig serves the gateway's own routes plus /stream, which writes a
// chunk every tick until it has written n, on a real listener.
type drainRig struct {
	gw      *Gateway
	server  *http.Server
	url     string
	started chan struct{}
	release chan struct{}
}

func newDrainRig(t *testing.T, delay, drain time.Duration) *drainRig {
	t.Helper()
	rig := &drainRig{
		gw:      NewGateway(&Config{GatewayCredential: testGatewayCredential, ShutdownDelay: delay, DrainTimeout: drain}),
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
	}
	mux := http.NewServeMux()
	mux.Handle("/", rig.gw)
	mux.HandleFunc("/stream", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		flusher := w.(http.Flusher)
		fmt.Fprint(w, "data: first\n\n")
		flusher.Flush()
		rig.started <- struct{}{}
		<-rig.release
		fmt.Fprint(w, "data: last\n\n")
	})
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	rig.server = &http.Server{Handler: mux}
	go rig.server.Serve(ln)
	rig.url = "http://" + ln.Addr().String()
	t.Cleanup(func() { rig.server.Close() })
	return rig
}

func TestDrainFinishesAStreamInFlightAndRefusesNewWorkAfter(t *testing.T) {
	rig := newDrainRig(t, 300*time.Millisecond, 5*time.Second)

	streamed := make(chan string, 1)
	go func() {
		resp, err := http.Get(rig.url + "/stream")
		if err != nil {
			streamed <- "error: " + err.Error()
			return
		}
		defer resp.Body.Close()
		body, _ := io.ReadAll(resp.Body)
		streamed <- string(body)
	}()
	<-rig.started

	drained := make(chan bool, 1)
	go func() { drained <- rig.gw.drain(rig.server) }()

	// Inside the delay: not ready, but still serving, since the load
	// balancer may not have noticed yet.
	deadline := time.Now().Add(time.Second)
	for !rig.gw.draining.Load() && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	resp, err := http.Get(rig.url + "/ready")
	if err != nil {
		t.Fatalf("a request inside the shutdown delay must still be served: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Errorf("/ready = %d during the delay, want 503", resp.StatusCode)
	}
	if !resp.Close {
		t.Error("a draining replica should close keep-alive connections so clients move on")
	}

	// After the delay the listener is closed while the stream is still open.
	time.Sleep(500 * time.Millisecond)
	select {
	case <-drained:
		t.Fatal("drain returned while a stream was still in flight")
	default:
	}
	if _, err := net.DialTimeout("tcp", strings.TrimPrefix(rig.url, "http://"), 200*time.Millisecond); err == nil {
		t.Error("the listener should be closed once the delay is over")
	}

	close(rig.release)
	if body := <-streamed; body != "data: first\n\ndata: last\n\n" {
		t.Errorf("stream body = %q, want both events", body)
	}
	if clean := <-drained; !clean {
		t.Error("drain should report clean when every request finished in time")
	}
}

func TestDrainCutsWhatOutlivesTheTimeout(t *testing.T) {
	rig := newDrainRig(t, 0, 200*time.Millisecond)
	defer close(rig.release)

	done := make(chan error, 1)
	go func() {
		resp, err := http.Get(rig.url + "/stream")
		if err != nil {
			done <- err
			return
		}
		defer resp.Body.Close()
		_, err = io.ReadAll(bufio.NewReader(resp.Body))
		done <- err
	}()
	<-rig.started

	start := time.Now()
	if clean := rig.gw.drain(rig.server); clean {
		t.Error("drain should report a request it had to cut")
	}
	if took := time.Since(start); took > 2*time.Second {
		t.Errorf("drain took %v, want about the 200ms timeout", took)
	}
	select {
	case err := <-done:
		if err == nil {
			t.Error("the cut stream should end in an error, not a clean EOF")
		}
	case <-time.After(2 * time.Second):
		t.Error("the stream was not cut at the drain timeout")
	}
}

func TestDrainWaitsForUsageReports(t *testing.T) {
	var received atomic.Int64
	backend := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		received.Add(1)
		w.WriteHeader(http.StatusAccepted)
	}))
	defer backend.Close()

	rig := newDrainRig(t, 0, time.Second)
	defer close(rig.release)
	cfg := &Config{ZentinelleURL: backend.URL}
	for i := 0; i < 3; i++ {
		ReportUsage(cfg, "sk_agent_x", "", "openai", "gpt", UsageData{Reported: true}, 1, fmt.Sprint(i), 200, outcomeCompleted)
	}
	if clean := rig.gw.drain(rig.server); !clean {
		t.Error("drain should be clean once the reports land")
	}
	if got := received.Load(); got != 3 {
		t.Errorf("usage reports delivered before drain returned = %d, want 3", got)
	}
}

func TestEMFRecordCarriesInFlightRequestsAndLatency(t *testing.T) {
	n := len(latencyBuckets)
	prev := histogram{counts: make([]uint64, n), total: 4}
	for i := range prev.counts {
		prev.counts[i] = 4 // four earlier requests, all under 5ms
	}
	cur := histogram{counts: make([]uint64, n), total: 4 + 6}
	for i, upper := range latencyBuckets {
		cur.counts[i] = 4
		if upper >= 0.1 {
			cur.counts[i] += 2 // two at 100ms
		}
		if upper >= 2.5 {
			cur.counts[i] += 3 // three at 2.5s
		}
	}
	// and one slower than every bucket

	now := time.UnixMilli(1_700_000_000_000)
	fields := emfFields("Zentinelle/Gateway", now, 7, prev, cur)

	line, err := json.Marshal(fields)
	if err != nil {
		t.Fatal(err)
	}
	var record struct {
		AWS struct {
			Timestamp         int64
			CloudWatchMetrics []struct {
				Namespace  string
				Dimensions [][]string
				Metrics    []struct{ Name, Unit string }
			}
		} `json:"_aws"`
		RequestsInFlight int64
		Requests         uint64
		RequestLatency   struct {
			Values []float64
			Counts []uint64
		}
	}
	if err := json.Unmarshal(line, &record); err != nil {
		t.Fatal(err)
	}
	if record.AWS.Timestamp != now.UnixMilli() || len(record.AWS.CloudWatchMetrics) != 1 {
		t.Fatalf("bad _aws block: %s", line)
	}
	directive := record.AWS.CloudWatchMetrics[0]
	if directive.Namespace != "Zentinelle/Gateway" {
		t.Errorf("namespace = %q", directive.Namespace)
	}
	names := map[string]string{}
	for _, m := range directive.Metrics {
		names[m.Name] = m.Unit
	}
	if names["RequestsInFlight"] != "Count" || names["Requests"] != "Count" || names["RequestLatency"] != "Seconds" {
		t.Errorf("metrics = %v", names)
	}
	if record.RequestsInFlight != 7 || record.Requests != 6 {
		t.Errorf("in flight %d requests %d, want 7 and 6", record.RequestsInFlight, record.Requests)
	}
	wantValues, wantCounts := []float64{0.1, 2.5, emfOverflowSeconds}, []uint64{2, 3, 1}
	if fmt.Sprint(record.RequestLatency.Values) != fmt.Sprint(wantValues) ||
		fmt.Sprint(record.RequestLatency.Counts) != fmt.Sprint(wantCounts) {
		t.Errorf("latency = %v x %v, want %v x %v", record.RequestLatency.Values, record.RequestLatency.Counts, wantValues, wantCounts)
	}

	// A quiet interval still reports in-flight and zero requests, and no
	// latency distribution, which CloudWatch would refuse empty.
	quiet := emfFields("Zentinelle/Gateway", now, 0, cur, cur)
	if _, has := quiet["RequestLatency"]; has {
		t.Error("an interval with no requests should carry no latency values")
	}
	if quiet["Requests"] != uint64(0) {
		t.Errorf("quiet Requests = %v, want 0", quiet["Requests"])
	}
}
