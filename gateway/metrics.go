package main

import (
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
)

// Prometheus metrics, written by hand rather than with client_golang.
//
// The gateway's go.mod has no dependencies, and that is a property worth
// keeping for something that sits on the request path of every LLM call in a
// customer's cluster: no transitive supply chain, and an image that is one
// static binary. The text format is a few lines of printing, which is a
// smaller cost than the dependency.
//
// On label cardinality, which is how metrics endpoints usually go wrong: every
// label here has a bounded set of values. `provider` comes from the routing
// table, `model` from a request but in practice from a handful of names, and
// `status_code` from HTTP. `reason` is deliberately **not** a label on
// policy_denied_total, though the issue asked for it — a policy reason is free
// text written by whoever wrote the policy, so labelling by it lets a customer
// create unbounded time series in the scraper by editing a policy. The reason
// belongs in the log line, where it already is.
//
// A hard ceiling on distinct label sets backs that up: past it, new
// combinations are folded into an `overflow` series rather than allowed to
// grow without limit.

const maxLabelSets = 2000

// LLM latencies, from a policy check on the loopback to a long completion.
var latencyBuckets = []float64{
	0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30,
}

type counterVec struct {
	mu     sync.Mutex
	values map[string]uint64
}

func newCounterVec() *counterVec {
	return &counterVec{values: map[string]uint64{}}
}

func (c *counterVec) inc(labels string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if _, seen := c.values[labels]; !seen && len(c.values) >= maxLabelSets {
		c.values["overflow"]++
		return
	}
	c.values[labels]++
}

func (c *counterVec) snapshot() map[string]uint64 {
	c.mu.Lock()
	defer c.mu.Unlock()
	out := make(map[string]uint64, len(c.values))
	for k, v := range c.values {
		out[k] = v
	}
	return out
}

type histogram struct {
	counts []uint64
	sum    float64
	total  uint64
}

type histogramVec struct {
	mu     sync.Mutex
	values map[string]*histogram
}

func newHistogramVec() *histogramVec {
	return &histogramVec{values: map[string]*histogram{}}
}

func (h *histogramVec) observe(labels string, seconds float64) {
	h.mu.Lock()
	defer h.mu.Unlock()
	entry, seen := h.values[labels]
	if !seen {
		if len(h.values) >= maxLabelSets {
			labels = "overflow"
			entry, seen = h.values[labels]
		}
		if !seen {
			entry = &histogram{counts: make([]uint64, len(latencyBuckets))}
			h.values[labels] = entry
		}
	}
	for i, upper := range latencyBuckets {
		if seconds <= upper {
			entry.counts[i]++
		}
	}
	entry.sum += seconds
	entry.total++
}

func (h *histogramVec) snapshot() map[string]histogram {
	h.mu.Lock()
	defer h.mu.Unlock()
	out := make(map[string]histogram, len(h.values))
	for k, v := range h.values {
		counts := make([]uint64, len(v.counts))
		copy(counts, v.counts)
		out[k] = histogram{counts: counts, sum: v.sum, total: v.total}
	}
	return out
}

var (
	metricRequests          = newCounterVec()
	metricPolicyDenied      = newCounterVec()
	metricUpstreamErrors    = newCounterVec()
	metricPolicyCheckErrors = newCounterVec()

	metricRequestDuration     = newHistogramVec()
	metricPolicyCheckDuration = newHistogramVec()
	metricUpstreamDuration    = newHistogramVec()

	metricActiveConnections int64
)

// labels renders a label set in a fixed order, so the same request always
// produces the same series name.
func labels(pairs ...string) string {
	if len(pairs)%2 != 0 {
		return ""
	}
	type kv struct{ k, v string }
	items := make([]kv, 0, len(pairs)/2)
	for i := 0; i < len(pairs); i += 2 {
		items = append(items, kv{pairs[i], escapeLabel(pairs[i+1])})
	}
	sort.Slice(items, func(i, j int) bool { return items[i].k < items[j].k })

	var b strings.Builder
	for i, item := range items {
		if i > 0 {
			b.WriteString(",")
		}
		fmt.Fprintf(&b, "%s=%q", item.k, item.v)
	}
	return b.String()
}

func escapeLabel(v string) string {
	if v == "" {
		return "unknown"
	}
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `"`, `\"`)
	v = strings.ReplaceAll(v, "\n", " ")
	return v
}

func writeCounter(b *strings.Builder, name, help string, vec *counterVec) {
	fmt.Fprintf(b, "# HELP %s %s\n# TYPE %s counter\n", name, help, name)
	snapshot := vec.snapshot()
	for _, key := range sortedKeys(snapshot) {
		if key == "" {
			fmt.Fprintf(b, "%s %d\n", name, snapshot[key])
			continue
		}
		fmt.Fprintf(b, "%s{%s} %d\n", name, key, snapshot[key])
	}
}

func writeHistogram(b *strings.Builder, name, help string, vec *histogramVec) {
	fmt.Fprintf(b, "# HELP %s %s\n# TYPE %s histogram\n", name, help, name)
	snapshot := vec.snapshot()
	for _, key := range sortedHistKeys(snapshot) {
		entry := snapshot[key]
		prefix := ""
		if key != "" {
			prefix = key + ","
		}
		for i, upper := range latencyBuckets {
			fmt.Fprintf(b, "%s_bucket{%sle=\"%s\"} %d\n",
				name, prefix, strconv.FormatFloat(upper, 'g', -1, 64), entry.counts[i])
		}
		fmt.Fprintf(b, "%s_bucket{%sle=\"+Inf\"} %d\n", name, prefix, entry.total)
		if key == "" {
			fmt.Fprintf(b, "%s_sum %s\n%s_count %d\n",
				name, strconv.FormatFloat(entry.sum, 'g', -1, 64), name, entry.total)
			continue
		}
		fmt.Fprintf(b, "%s_sum{%s} %s\n%s_count{%s} %d\n",
			name, key, strconv.FormatFloat(entry.sum, 'g', -1, 64), name, key, entry.total)
	}
}

func sortedKeys(m map[string]uint64) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

func sortedHistKeys(m map[string]histogram) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}

// renderMetrics produces the Prometheus text exposition format.
func renderMetrics() string {
	var b strings.Builder

	writeCounter(&b, "zentinelle_gateway_requests_total",
		"Proxied requests, by provider, model and upstream status code.", metricRequests)
	writeCounter(&b, "zentinelle_gateway_policy_denied_total",
		"Requests refused by policy, by provider. The reason is in the log, not here: it is free text and would be unbounded as a label.",
		metricPolicyDenied)
	writeCounter(&b, "zentinelle_gateway_upstream_errors_total",
		"Failures reaching or reading from a provider.", metricUpstreamErrors)
	writeCounter(&b, "zentinelle_gateway_policy_check_errors_total",
		"Policy checks that could not be completed.", metricPolicyCheckErrors)

	writeHistogram(&b, "zentinelle_gateway_request_duration_seconds",
		"End-to-end time for a proxied request.", metricRequestDuration)
	writeHistogram(&b, "zentinelle_gateway_policy_check_duration_seconds",
		"Time spent asking Zentinelle whether a request is allowed.", metricPolicyCheckDuration)
	writeHistogram(&b, "zentinelle_gateway_upstream_duration_seconds",
		"Time spent waiting on the provider.", metricUpstreamDuration)

	fmt.Fprintf(&b, "# HELP zentinelle_gateway_active_connections Requests currently in flight.\n")
	fmt.Fprintf(&b, "# TYPE zentinelle_gateway_active_connections gauge\n")
	fmt.Fprintf(&b, "zentinelle_gateway_active_connections %d\n",
		atomic.LoadInt64(&metricActiveConnections))

	return b.String()
}

func handleMetrics(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "GET only")
		return
	}
	w.Header().Set("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
	w.WriteHeader(http.StatusOK)
	if r.Method != http.MethodHead {
		w.Write([]byte(renderMetrics()))
	}
}
