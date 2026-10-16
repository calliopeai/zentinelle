package main

// Metering contract against real provider response shapes (audit PR 4: C6,
// C14, H4, H7, M6, M7). The fixtures in testdata/provider_usage are what
// Anthropic, OpenAI and Gemini send, and manifest.json says what each one
// bills. The same manifest is meant for the Django proxy's parser.

import (
	"bytes"
	"compress/gzip"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

type usageFixture struct {
	Name                     string                 `json:"name"`
	File                     string                 `json:"file"`
	Provider                 string                 `json:"provider"`
	Path                     string                 `json:"path"`
	Request                  map[string]interface{} `json:"request"`
	ContentType              string                 `json:"content_type"`
	Model                    string                 `json:"model"`
	Content                  string                 `json:"content"`
	PromptTokens             int                    `json:"prompt_tokens"`
	CompletionTokens         int                    `json:"completion_tokens"`
	CacheReadInputTokens     int                    `json:"cache_read_input_tokens"`
	CacheCreationInputTokens int                    `json:"cache_creation_input_tokens"`
	UsageReported            bool                   `json:"usage_reported"`
}

func (f usageFixture) body(t *testing.T) []byte {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "provider_usage", f.File))
	if err != nil {
		t.Fatal(err)
	}
	return raw
}

func (f usageFixture) requestBody(t *testing.T) string {
	t.Helper()
	raw, err := json.Marshal(f.Request)
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func loadUsageFixtures(t *testing.T) []usageFixture {
	t.Helper()
	raw, err := os.ReadFile(filepath.Join("testdata", "provider_usage", "manifest.json"))
	if err != nil {
		t.Fatal(err)
	}
	var manifest struct {
		Cases []usageFixture `json:"cases"`
	}
	if err := json.Unmarshal(raw, &manifest); err != nil {
		t.Fatal(err)
	}
	if len(manifest.Cases) == 0 {
		t.Fatal("no fixtures in the manifest")
	}
	return manifest.Cases
}

func TestProviderUsageFixtures(t *testing.T) {
	for _, f := range loadUsageFixtures(t) {
		t.Run(f.Name, func(t *testing.T) {
			got := ExtractUsage(f.body(t), f.Provider)
			want := UsageData{
				PromptTokens:     f.PromptTokens,
				CompletionTokens: f.CompletionTokens,
				CacheReadTokens:  f.CacheReadInputTokens,
				CacheWriteTokens: f.CacheCreationInputTokens,
				Reported:         f.UsageReported,
			}
			if got != want {
				t.Errorf("usage = %+v, want %+v", got, want)
			}
		})
	}
}

// meteringPlane stands in for Zentinelle: it records usage events and the
// policy checks, requires an output filter when told to, and denies any
// response containing denyOutput.
type meteringPlane struct {
	mu           sync.Mutex
	events       []EventRow
	rawEvents    [][]byte
	checks       []PolicyRequest
	eventStatus  []int // status per successive events POST; 202 after the list
	filter       bool
	denyOutput   string
	eventArrived chan struct{}
}

func newMeteringPlane(t *testing.T, filter bool, denyOutput string) (*meteringPlane, *httptest.Server) {
	t.Helper()
	p := &meteringPlane{filter: filter, denyOutput: denyOutput, eventArrived: make(chan struct{}, 64)}
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		raw := new(bytes.Buffer)
		raw.ReadFrom(r.Body)
		if strings.HasSuffix(r.URL.Path, "/events") {
			var ev UsageEvent
			json.Unmarshal(raw.Bytes(), &ev)
			p.mu.Lock()
			status := http.StatusAccepted
			if n := len(p.rawEvents); n < len(p.eventStatus) {
				status = p.eventStatus[n]
			}
			p.rawEvents = append(p.rawEvents, raw.Bytes())
			if status < 300 {
				p.events = append(p.events, ev.Events...)
			}
			p.mu.Unlock()
			w.WriteHeader(status)
			p.eventArrived <- struct{}{}
			return
		}
		var req PolicyRequest
		json.Unmarshal(raw.Bytes(), &req)
		p.mu.Lock()
		p.checks = append(p.checks, req)
		p.mu.Unlock()
		if req.Action == "llm:response" {
			out, _ := req.Context["output_text"].(string)
			allowed := p.denyOutput == "" || !strings.Contains(out, p.denyOutput)
			json.NewEncoder(w).Encode(map[string]interface{}{"allowed": allowed, "reason": "output filter"})
			return
		}
		json.NewEncoder(w).Encode(map[string]interface{}{"allowed": true, "output_filter_required": p.filter})
	}))
	t.Cleanup(srv.Close)
	return p, srv
}

// waitEvents waits until n events POSTs arrived and returns the accepted rows.
func (p *meteringPlane) waitEvents(t *testing.T, n int) []EventRow {
	t.Helper()
	for i := 0; i < n; i++ {
		select {
		case <-p.eventArrived:
		case <-time.After(5 * time.Second):
			t.Fatalf("usage event %d of %d never arrived", i+1, n)
		}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	return append([]EventRow(nil), p.events...)
}

func (p *meteringPlane) outputChecks() []string {
	p.mu.Lock()
	defer p.mu.Unlock()
	var out []string
	for _, c := range p.checks {
		if c.Action == "llm:response" {
			s, _ := c.Context["output_text"].(string)
			out = append(out, s)
		}
	}
	return out
}

func (p *meteringPlane) inputModel() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	for _, c := range p.checks {
		if c.Action == "llm:invoke" {
			m, _ := c.Context["model"].(string)
			return m
		}
	}
	return ""
}

// providerStub answers with one fixture. It gzips whenever the request
// accepts gzip, as the providers' edges do; alwaysGzip gzips regardless, as a
// provider that ignores Accept-Encoding: identity would.
func providerStub(t *testing.T, f usageFixture, alwaysGzip bool, sawAcceptEncoding *string) *httptest.Server {
	t.Helper()
	body := f.body(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ae := r.Header.Get("Accept-Encoding")
		if sawAcceptEncoding != nil {
			*sawAcceptEncoding = ae
		}
		w.Header().Set("Content-Type", f.ContentType)
		if alwaysGzip || strings.Contains(ae, "gzip") {
			w.Header().Set("Content-Encoding", "gzip")
			zw := gzip.NewWriter(w)
			zw.Write(body)
			zw.Close()
			return
		}
		w.Write(body)
	}))
	t.Cleanup(srv.Close)
	return srv
}

func meteringConfig(controlURL string) *Config {
	return &Config{
		ZentinelleURL:    controlURL,
		PolicyTimeout:    5 * time.Second,
		MaxResponseBytes: 1 << 20,
		ProviderAPIKeys: map[string]string{
			"openai": "sk-test", "anthropic": "sk-ant-test", "google": "goog-test",
		},
		AllowEnvProviderKeys: true,
	}
}

// proxyFixture sends a fixture's request through the gateway with the
// headers an official SDK sends.
func proxyFixture(t *testing.T, gw *Gateway, f usageFixture, w http.ResponseWriter) {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, f.Path, strings.NewReader(f.requestBody(t)))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept-Encoding", "gzip, deflate, br")
	gw.ServeHTTP(w, req)
}

func checkUsageEvent(t *testing.T, ev EventRow, f usageFixture, outcome string) {
	t.Helper()
	p := ev.Payload
	num := func(key string) int {
		n, _ := p[key].(float64)
		return int(n)
	}
	if ev.Type != "llm:usage" {
		t.Errorf("event type = %q", ev.Type)
	}
	if rid, _ := p["request_id"].(string); !strings.HasPrefix(ev.EventID, "gateway-usage-") ||
		len(ev.EventID) <= len("gateway-usage-") || strings.Contains(ev.EventID, rid) || rid == "" {
		t.Errorf("event_id = %q for request %q, want a gateway ID the client cannot derive", ev.EventID, rid)
	}
	if got := p["model"]; got != f.Model {
		t.Errorf("model = %v, want %q", got, f.Model)
	}
	if got := p["outcome"]; got != outcome {
		t.Errorf("outcome = %v, want %q", got, outcome)
	}
	if got := p["usage_reported"]; got != f.UsageReported {
		t.Errorf("usage_reported = %v, want %v", got, f.UsageReported)
	}
	for key, want := range map[string]int{
		"prompt_tokens":               f.PromptTokens,
		"completion_tokens":           f.CompletionTokens,
		"total_tokens":                f.PromptTokens + f.CompletionTokens,
		"cache_read_input_tokens":     f.CacheReadInputTokens,
		"cache_creation_input_tokens": f.CacheCreationInputTokens,
	} {
		if got := num(key); got != want {
			t.Errorf("%s = %d, want %d", key, got, want)
		}
	}
}

// Every fixture through the gateway, with the SDK's Accept-Encoding: gzip,
// with and without an output filter. The provider must be asked for an
// uncompressed body, the event must carry the fixture's usage and model, and
// the filter must read the content rather than compressed bytes.
func TestProviderUsageThroughGateway(t *testing.T) {
	for _, f := range loadUsageFixtures(t) {
		for _, filter := range []bool{false, true} {
			name := f.Name
			if filter {
				name += ", output filter"
			}
			t.Run(name, func(t *testing.T) {
				plane, control := newMeteringPlane(t, filter, "")
				var sawAE string
				pointProviderAt(t, f.Provider, providerStub(t, f, false, &sawAE).URL)
				w := httptest.NewRecorder()
				proxyFixture(t, NewGateway(meteringConfig(control.URL)), f, w)

				if w.Code != http.StatusOK {
					t.Fatalf("status = %d: %s", w.Code, w.Body.String())
				}
				if sawAE != "identity" {
					t.Errorf("provider was sent Accept-Encoding %q, want identity", sawAE)
				}
				if !bytes.Equal(w.Body.Bytes(), f.body(t)) {
					t.Errorf("client did not receive the provider's body unchanged")
				}
				if got := plane.inputModel(); got != f.Model {
					t.Errorf("policy check model = %q, want %q", got, f.Model)
				}
				events := plane.waitEvents(t, 1)
				if len(events) != 1 {
					t.Fatalf("got %d usage events, want 1", len(events))
				}
				checkUsageEvent(t, events[0], f, outcomeCompleted)
				if filter {
					outputs := plane.outputChecks()
					if len(outputs) != 1 || !strings.Contains(outputs[0], f.Content) {
						t.Errorf("output filter saw %q, want text containing %q", outputs, f.Content)
					}
				}
			})
		}
	}
}

// A provider that gzips despite Accept-Encoding: identity. The client gets
// the compressed body it can decode; the gateway meters and filters the
// decoded one, so PII in a gzip body is still withheld.
func TestCompressedResponseIsMeteredAndFiltered(t *testing.T) {
	f := loadUsageFixtures(t)[3] // openai chat completions
	t.Run("delivered", func(t *testing.T) {
		plane, control := newMeteringPlane(t, true, "")
		pointProviderAt(t, f.Provider, providerStub(t, f, true, nil).URL)
		w := httptest.NewRecorder()
		proxyFixture(t, NewGateway(meteringConfig(control.URL)), f, w)
		if w.Code != http.StatusOK || w.Header().Get("Content-Encoding") != "gzip" {
			t.Fatalf("status %d, Content-Encoding %q", w.Code, w.Header().Get("Content-Encoding"))
		}
		checkUsageEvent(t, plane.waitEvents(t, 1)[0], f, outcomeCompleted)
		if outputs := plane.outputChecks(); len(outputs) != 1 || !strings.Contains(outputs[0], f.Content) {
			t.Errorf("output filter saw %q, want decoded text", outputs)
		}
	})
	t.Run("withheld", func(t *testing.T) {
		plane, control := newMeteringPlane(t, true, f.Content)
		pointProviderAt(t, f.Provider, providerStub(t, f, true, nil).URL)
		w := httptest.NewRecorder()
		proxyFixture(t, NewGateway(meteringConfig(control.URL)), f, w)
		if w.Code != http.StatusForbidden {
			t.Fatalf("status = %d, want 403: the filter did not see the gzip body's content", w.Code)
		}
		checkUsageEvent(t, plane.waitEvents(t, 1)[0], f, outcomeOutputFiltered)
	})
}

// An encoding the gateway cannot decode is uninspectable, and an output
// filter fails closed on it. The provider billed the call, so it is metered.
func TestUndecodableResponseFailsClosedUnderAFilter(t *testing.T) {
	plane, control := newMeteringPlane(t, true, "")
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Content-Encoding", "br")
		w.Write([]byte{0x8b, 0x02, 0x80, 0x53, 0x53, 0x4e})
	}))
	defer upstream.Close()
	pointProviderAt(t, "openai", upstream.URL)
	f := loadUsageFixtures(t)[3]
	w := httptest.NewRecorder()
	proxyFixture(t, NewGateway(meteringConfig(control.URL)), f, w)
	if w.Code != http.StatusBadGateway || !strings.Contains(w.Body.String(), "inspection_failed") {
		t.Fatalf("status = %d %s, want 502 inspection_failed", w.Code, w.Body.String())
	}
	if len(plane.outputChecks()) != 0 {
		t.Error("an undecodable body was passed to the output filter")
	}
	events := plane.waitEvents(t, 1)
	if got := events[0].Payload["outcome"]; got != outcomeInspectionFailed {
		t.Errorf("outcome = %v", got)
	}
}

// The request side of the same gap: a compressed request body would reach the
// provider without any input filter having read it.
func TestCompressedRequestBodyIsRefused(t *testing.T) {
	_, control := newMeteringPlane(t, false, "")
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	defer upstream.Close()
	pointProviderAt(t, "openai", upstream.URL)
	var gz bytes.Buffer
	zw := gzip.NewWriter(&gz)
	zw.Write([]byte(`{"model":"gpt-4o","messages":[{"role":"user","content":"SSN 123-45-6789"}]}`))
	zw.Close()
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", &gz)
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	req.Header.Set("Content-Encoding", "gzip")
	w := httptest.NewRecorder()
	NewGateway(meteringConfig(control.URL)).ServeHTTP(w, req)
	if w.Code != http.StatusUnsupportedMediaType {
		t.Errorf("status = %d, want 415", w.Code)
	}
	if called {
		t.Error("a compressed request body reached the provider")
	}
}

// The output filter withheld the response; the provider billed it anyway.
func TestOutputFilterDenialIsMetered(t *testing.T) {
	for _, f := range loadUsageFixtures(t) {
		if !f.UsageReported {
			continue
		}
		t.Run(f.Name, func(t *testing.T) {
			plane, control := newMeteringPlane(t, true, f.Content)
			pointProviderAt(t, f.Provider, providerStub(t, f, false, nil).URL)
			w := httptest.NewRecorder()
			proxyFixture(t, NewGateway(meteringConfig(control.URL)), f, w)
			if w.Code != http.StatusForbidden {
				t.Fatalf("status = %d, want 403", w.Code)
			}
			checkUsageEvent(t, plane.waitEvents(t, 1)[0], f, outcomeOutputFiltered)
		})
	}
}

// disconnectingWriter is a client that goes away after its first write.
type disconnectingWriter struct {
	h      http.Header
	writes int
}

func (d *disconnectingWriter) Header() http.Header { return d.h }
func (d *disconnectingWriter) WriteHeader(int)     {}
func (d *disconnectingWriter) Write(p []byte) (int, error) {
	d.writes++
	if d.writes > 1 {
		return 0, http.ErrHandlerTimeout
	}
	return len(p), nil
}

// A client that stops reading mid-stream. Usage arrives at the end of a
// stream, so the gateway keeps reading what the provider sends, and stops
// sending it, rather than dropping the call's usage with the client.
func TestClientDisconnectMidStreamIsMetered(t *testing.T) {
	f := loadUsageFixtures(t)[4] // openai chat stream, include_usage
	plane, control := newMeteringPlane(t, false, "")
	body := f.body(t)
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", f.ContentType)
		flusher := w.(http.Flusher)
		for _, event := range bytes.SplitAfter(body, []byte("\n\n")) {
			w.Write(event)
			flusher.Flush()
			time.Sleep(10 * time.Millisecond)
		}
	}))
	defer upstream.Close()
	pointProviderAt(t, "openai", upstream.URL)
	client := &disconnectingWriter{h: http.Header{}}
	proxyFixture(t, NewGateway(meteringConfig(control.URL)), f, client)
	if client.writes < 2 {
		t.Fatalf("the client saw %d writes; the stream never reached the disconnect", client.writes)
	}
	checkUsageEvent(t, plane.waitEvents(t, 1)[0], f, outcomeClientDisconnected)
}

// A stream cut off at the size limit. Anthropic reports input tokens in its
// first event, so the input the provider billed is still counted.
func TestOversizeStreamIsMeteredFromWhatArrived(t *testing.T) {
	f := loadUsageFixtures(t)[2] // anthropic stream, prompt cache
	for _, filter := range []bool{false, true} {
		t.Run(map[bool]string{false: "streamed", true: "output filter"}[filter], func(t *testing.T) {
			plane, control := newMeteringPlane(t, filter, "")
			pointProviderAt(t, f.Provider, providerStub(t, f, false, nil).URL)
			cfg := meteringConfig(control.URL)
			cfg.MaxResponseBytes = int64(bytes.Index(f.body(t), []byte("event: message_delta")))
			proxyFixture(t, NewGateway(cfg), f, httptest.NewRecorder())
			want := map[bool]string{false: outcomeResponseTooLarge, true: outcomeInspectionFailed}[filter]
			ev := plane.waitEvents(t, 1)[0]
			if got := ev.Payload["outcome"]; got != want {
				t.Errorf("outcome = %v, want %s", got, want)
			}
			if got, _ := ev.Payload["prompt_tokens"].(float64); int(got) != f.PromptTokens {
				t.Errorf("prompt_tokens = %v, want %d from message_start", got, f.PromptTokens)
			}
			if got := ev.Payload["cache_read_input_tokens"]; got != float64(f.CacheReadInputTokens) {
				t.Errorf("cache_read_input_tokens = %v", got)
			}
		})
	}
}

// TestMain shortens the usage retry backoff for every test. Reports to a stub
// that a test has already closed retry in the background, and at production
// delays they would hold the process-wide pending count for seconds.
func TestMain(m *testing.M) {
	usageRetryDelays = []time.Duration{time.Millisecond, time.Millisecond, time.Millisecond}
	os.Exit(m.Run())
}

// A usage report that Zentinelle could not take is retried with the same
// bytes, so the event ID makes a retry after a lost answer a duplicate.
func TestUsageReportIsRetriedWithTheSameEvent(t *testing.T) {
	plane, control := newMeteringPlane(t, false, "")
	plane.eventStatus = []int{http.StatusServiceUnavailable, http.StatusTooManyRequests}
	ReportUsage(&Config{ZentinelleURL: control.URL}, "key", "openai", "gpt-4o",
		UsageData{PromptTokens: 10, CompletionTokens: 5, Reported: true}, 12, "req-retry", http.StatusOK, outcomeCompleted)
	events := plane.waitEvents(t, 3)
	if len(events) != 1 || !strings.HasPrefix(events[0].EventID, "gateway-usage-") {
		t.Fatalf("accepted events = %+v", events)
	}
	plane.mu.Lock()
	defer plane.mu.Unlock()
	for i, raw := range plane.rawEvents[1:] {
		if !bytes.Equal(raw, plane.rawEvents[0]) {
			t.Errorf("attempt %d sent different bytes: the backend would see a conflicting event ID", i+2)
		}
	}
}

// A rejection a retry cannot fix is not retried.
func TestUsageReportIsNotRetriedOnAClientError(t *testing.T) {
	plane, control := newMeteringPlane(t, false, "")
	plane.eventStatus = []int{http.StatusBadRequest}
	ReportUsage(&Config{ZentinelleURL: control.URL}, "key", "openai", "gpt-4o",
		UsageData{}, 12, "req-400", http.StatusOK, outcomeCompleted)
	plane.waitEvents(t, 1)
	// Retries here are 1ms apart, so one would have arrived by now.
	time.Sleep(100 * time.Millisecond)
	plane.mu.Lock()
	defer plane.mu.Unlock()
	if len(plane.rawEvents) != 1 {
		t.Errorf("a 400 was retried: %d attempts", len(plane.rawEvents))
	}
}

// Shutdown waits for reports still in flight rather than exiting under them.
func TestShutdownDrainsPendingUsageReports(t *testing.T) {
	release := make(chan struct{})
	var delivered sync.WaitGroup
	delivered.Add(1)
	control := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		<-release
		w.WriteHeader(http.StatusAccepted)
		delivered.Done()
	}))
	defer control.Close()
	ReportUsage(&Config{ZentinelleURL: control.URL}, "key", "openai", "gpt-4o",
		UsageData{}, 12, "req-drain", http.StatusOK, outcomeCompleted)

	if drainUsageReports(contextWithTimeout(t, 50*time.Millisecond)) {
		t.Fatal("drain returned while a report was still being sent")
	}
	close(release)
	if !drainUsageReports(contextWithTimeout(t, 5*time.Second)) {
		t.Fatal("drain did not see the report finish")
	}
	delivered.Wait()
}

func contextWithTimeout(t *testing.T, d time.Duration) context.Context {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), d)
	t.Cleanup(cancel)
	return ctx
}

// A second Content-Encoding line after "identity" is forwarded as sent, so it
// is refused like the first.
func TestCompressedRequestBodyBehindAnIdentityHeaderIsRefused(t *testing.T) {
	_, control := newMeteringPlane(t, false, "")
	called := false
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { called = true }))
	defer upstream.Close()
	pointProviderAt(t, "openai", upstream.URL)
	req := httptest.NewRequest(http.MethodPost, "/v1/chat/completions", strings.NewReader("compressed"))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	req.Header.Add("Content-Encoding", "identity")
	req.Header.Add("Content-Encoding", "gzip")
	w := httptest.NewRecorder()
	NewGateway(meteringConfig(control.URL)).ServeHTTP(w, req)
	if w.Code != http.StatusUnsupportedMediaType || called {
		t.Errorf("status = %d, provider called = %v; want 415 and no call", w.Code, called)
	}
}

// The Gemini model the policy check and the meter see is the one the
// provider is asked for: a dot segment cannot make them differ.
func TestGeminiModelPathCannotDivergeFromTheForwardedPath(t *testing.T) {
	plane, control := newMeteringPlane(t, false, "")
	var forwarded string
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		forwarded = r.URL.Path
		w.Write([]byte(`{}`))
	}))
	defer upstream.Close()
	pointProviderAt(t, "google", upstream.URL)
	req := httptest.NewRequest(http.MethodPost,
		"/v1beta/models/gemini-1.5-flash-8b/../gemini-2.5-pro:generateContent", strings.NewReader(`{"contents":[]}`))
	req.Header.Set("X-Zentinelle-Key", "sk_agent_test")
	w := httptest.NewRecorder()
	NewGateway(meteringConfig(control.URL)).ServeHTTP(w, req)
	if forwarded != "/v1beta/models/gemini-2.5-pro:generateContent" {
		t.Errorf("provider was asked for %q", forwarded)
	}
	if got := plane.inputModel(); got != "gemini-2.5-pro" {
		t.Errorf("policy check model = %q, want gemini-2.5-pro", got)
	}
	if got := plane.waitEvents(t, 1)[0].Payload["model"]; got != "gemini-2.5-pro" {
		t.Errorf("metered model = %v, want gemini-2.5-pro", got)
	}
}
