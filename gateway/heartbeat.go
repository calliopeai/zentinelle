package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/json"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"net/url"
	"sync"
	"sync/atomic"
	"time"
)

// Cluster heartbeats (#391).
//
// A gateway that Astrolift registered for a cluster reports on that cluster to
// Zentinelle: POST /api/zentinelle/v1/astrolift/clusters/<id>/heartbeat with
// its own credential, carrying a status, the build version and counters. The
// portal shows a cluster as pending until its first heartbeat and as stale
// after five silent minutes.
//
// Zentinelle stores each beat's counters as they are and drops the ones it
// does not know, so the counters are running totals since the gateway
// started. A beat never resets them, and a beat that fails loses nothing: the
// next one carries the same totals, grown.

const (
	defaultHeartbeatInterval = 60 * time.Second

	// The bounds on HEARTBEAT_INTERVAL_SECONDS, and on the interval an answer
	// asks for. Zentinelle reads a cluster as stale after five silent minutes.
	minHeartbeatInterval = 10 * time.Second
	maxHeartbeatInterval = time.Hour

	// A failed beat is retried after 10s, then 20s, 40s and so on, never more
	// than this apart.
	maxHeartbeatBackoff = 5 * time.Minute

	// A heartbeat is off the request path, so it can wait longer than a
	// policy check does.
	heartbeatTimeout = 10 * time.Second

	// agents_seen keeps a digest per agent key, and agent keys can be per
	// task, so the set is bounded. Past this many the count stops growing.
	maxAgentsSeen = 100000
)

// version is the build version, set with -ldflags "-X main.version=...".
var version = "dev"

// gatewayStats are the counters a heartbeat reports, and the outcomes of the
// gateway's own calls to Zentinelle that its status is judged from. Every one
// is a running total since the gateway started.
type gatewayStats struct {
	requests atomic.Int64 // proxied requests
	blocked  atomic.Int64 // refused by the policy check, or withheld by the output filter

	checksAnswered   atomic.Int64 // request-time policy checks Zentinelle answered
	checksUnanswered atomic.Int64 // ... and ones that got no usable answer
	lookupsAnswered  atomic.Int64 // provider-key lookups that succeeded
	lookupsFailed    atomic.Int64 // ... and ones that failed

	agents agentSet
}

func newGatewayStats(maxAgents int) *gatewayStats {
	return &gatewayStats{agents: agentSet{max: maxAgents, seen: map[[sha256.Size]byte]struct{}{}}}
}

// policyChecked records a request-time policy check. A check that failed
// because the client went away says nothing about Zentinelle and is not
// counted.
func (s *gatewayStats) policyChecked(ctx context.Context, agentKey string, result PolicyResult) {
	switch {
	case result.outcome == policyDecided:
		s.checksAnswered.Add(1)
		s.agents.add(agentKey)
	case result.outcome == policyRefused:
		s.checksAnswered.Add(1)
	case ctx.Err() == nil:
		s.checksUnanswered.Add(1)
	}
}

// lookedUp records a provider-key lookup that went to Zentinelle, as policyChecked does.
func (s *gatewayStats) lookedUp(ctx context.Context, err error) {
	switch {
	case err == nil:
		s.lookupsAnswered.Add(1)
	case ctx.Err() == nil:
		s.lookupsFailed.Add(1)
	}
}

// agentSet counts distinct agent keys. It holds their SHA-256 digests, as the
// provider key cache does, and never a key.
type agentSet struct {
	mu   sync.Mutex
	max  int
	seen map[[sha256.Size]byte]struct{}
}

func (a *agentSet) add(agentKey string) {
	digest := sha256.Sum256([]byte(agentKey))

	a.mu.Lock()
	_, known := a.seen[digest]
	added := !known && len(a.seen) < a.max
	if added {
		a.seen[digest] = struct{}{}
	}
	filled := added && len(a.seen) == a.max
	a.mu.Unlock()

	if filled {
		logJSON("warn", "agents_seen reached its bound and stops counting", map[string]interface{}{"bound": a.max})
	}
}

func (a *agentSet) count() int64 {
	a.mu.Lock()
	defer a.mu.Unlock()
	return int64(len(a.seen))
}

type statsSnapshot struct {
	requests, blocked, agentsSeen    int64
	checksAnswered, checksUnanswered int64
	lookupsAnswered, lookupsFailed   int64
}

func (s *gatewayStats) snapshot() statsSnapshot {
	return statsSnapshot{
		requests:         s.requests.Load(),
		blocked:          s.blocked.Load(),
		agentsSeen:       s.agents.count(),
		checksAnswered:   s.checksAnswered.Load(),
		checksUnanswered: s.checksUnanswered.Load(),
		lookupsAnswered:  s.lookupsAnswered.Load(),
		lookupsFailed:    s.lookupsFailed.Load(),
	}
}

// heartbeatStatus judges the gateway by its own calls to Zentinelle between
// two snapshots: unhealthy when every policy check, or every provider-key
// lookup, failed; degraded when some did; healthy otherwise, including when
// there were none.
func heartbeatStatus(from, to statsSnapshot) string {
	answered, unanswered := to.checksAnswered-from.checksAnswered, to.checksUnanswered-from.checksUnanswered
	found, failed := to.lookupsAnswered-from.lookupsAnswered, to.lookupsFailed-from.lookupsFailed
	switch {
	case (unanswered > 0 && answered == 0) || (failed > 0 && found == 0):
		return "unhealthy"
	case unanswered > 0 || failed > 0:
		return "degraded"
	default:
		return "healthy"
	}
}

// heartbeatPayload is the body Zentinelle takes, and all of it: it drops
// counters it does not know.
type heartbeatPayload struct {
	Status   string            `json:"status"`
	Version  string            `json:"version"`
	Counters heartbeatCounters `json:"counters"`
}

type heartbeatCounters struct {
	Requests   int64 `json:"requests"`
	Blocked    int64 `json:"blocked"`
	AgentsSeen int64 `json:"agents_seen"`
}

// heartbeatAnswer is Zentinelle's acknowledgement, naming when it wants the next beat.
type heartbeatAnswer struct {
	Acknowledged         bool  `json:"acknowledged"`
	NextHeartbeatSeconds int64 `json:"next_heartbeat_seconds"`
}

// heartbeatEnabled reports whether this gateway reports on its cluster: it has
// to know the cluster, have somewhere to get its credential from, and not have
// heartbeats turned off.
func heartbeatEnabled(cfg *Config) bool {
	return cfg.ClusterID != "" && cfg.HeartbeatInterval > 0 &&
		(cfg.GatewayCredential != "" || cfg.GatewayCredentialFile != "")
}

type heartbeat struct {
	cfg        *Config
	credential *gatewayCredential
	stats      *gatewayStats
	client     *http.Client
	url        string

	// interval is the time between beats: the configured one until an answer
	// names another.
	interval time.Duration
	// delivered is the snapshot the last delivered beat was built from, the
	// start of the window the next status is judged over.
	delivered statsSnapshot
	// presented is the credential the last beat was sent with.
	presented string

	wait   func(ctx context.Context, d time.Duration) bool
	jitter func(d time.Duration) time.Duration
}

func (g *Gateway) newHeartbeat() *heartbeat {
	return &heartbeat{
		cfg:        g.cfg,
		credential: g.credential,
		stats:      g.stats,
		client:     heartbeatClient,
		url:        g.cfg.ZentinelleURL + "/api/zentinelle/v1/astrolift/clusters/" + url.PathEscape(g.cfg.ClusterID) + "/heartbeat",
		interval:   g.cfg.HeartbeatInterval,
		wait:       waitFor,
		jitter:     jitter,
	}
}

// startHeartbeat reports on the cluster until ctx ends, if this gateway
// reports at all. The channel is closed once it has stopped.
func (g *Gateway) startHeartbeat(ctx context.Context) <-chan struct{} {
	done := make(chan struct{})
	if !heartbeatEnabled(g.cfg) {
		close(done)
		return done
	}
	h := g.newHeartbeat()
	go func() {
		defer close(done)
		h.run(ctx)
	}()
	return done
}

type beatOutcome int

const (
	beatDelivered beatOutcome = iota
	beatFailed
	// beatNotRegistered is a 404: this gateway's credential is not one
	// Astrolift registered for this cluster (the compose `local` gateway, an
	// operator's registration, or a different ZENTINELLE_CLUSTER_ID).
	beatNotRegistered
	// beatNoCredential: the credential file has not appeared yet.
	beatNoCredential
)

// run sends a beat now and then one per interval until ctx ends.
func (h *heartbeat) run(ctx context.Context) {
	logJSON("info", "cluster heartbeat started", map[string]interface{}{
		"cluster_id": h.cfg.ClusterID, "interval": h.interval.String(),
	})

	failures := 0
	for {
		outcome, err := h.beat(ctx)
		if ctx.Err() != nil {
			return
		}

		var delay time.Duration
		switch outcome {
		case beatDelivered:
			if failures > 0 {
				logJSON("info", "cluster heartbeat delivered again", map[string]interface{}{
					"cluster_id": h.cfg.ClusterID, "failed_attempts": failures,
				})
			}
			failures = 0
			delay = h.jitter(h.interval)
		case beatFailed:
			failures++
			delay = h.jitter(heartbeatBackoff(failures))
			logJSON("warn", "cluster heartbeat failed", map[string]interface{}{
				"cluster_id": h.cfg.ClusterID, "error": err.Error(),
				"consecutive_failures": failures, "retry_in": delay.Round(time.Second).String(),
			})
		case beatNotRegistered:
			logJSON("warn", "cluster heartbeat stopped: Zentinelle has no Astrolift cluster with this id "+
				"for this gateway's credential", map[string]interface{}{
				"cluster_id": h.cfg.ClusterID, "status": http.StatusNotFound,
			})
			if !h.awaitNewCredential(ctx) {
				return
			}
			logJSON("info", "cluster heartbeat resumed: the gateway credential changed", map[string]interface{}{
				"cluster_id": h.cfg.ClusterID,
			})
			failures = 0
			continue
		case beatNoCredential:
			// Nothing to present yet; current() looks in the file again next time.
			delay = h.jitter(h.interval)
		}

		if !h.wait(ctx, delay) {
			return
		}
	}
}

// awaitNewCredential waits, reading the credential file once an interval,
// until the gateway holds a credential other than the one refused: Astrolift
// registering the cluster again, or adopting this gateway, writes a new one.
// The provider-key lookup may be the one to read it, so what counts is the
// credential in hand, not whether this read changed it. It returns false when
// ctx ends, and at once for a credential from the environment, which never
// changes.
func (h *heartbeat) awaitNewCredential(ctx context.Context) bool {
	if h.credential.path == "" {
		return false
	}
	for {
		if !h.wait(ctx, h.jitter(h.interval)) {
			return false
		}
		h.credential.reread()
		if current := h.credential.current(); current != "" && current != h.presented {
			return true
		}
	}
}

// beat sends one heartbeat. A refused credential may have been rotated, so,
// as the provider-key lookup does, it reads the credential file again and, if
// that gives a different one, retries once with it.
func (h *heartbeat) beat(ctx context.Context) (beatOutcome, error) {
	credential := h.credential.current()
	if credential == "" {
		return beatNoCredential, nil
	}

	snapshot := h.stats.snapshot()
	body, err := json.Marshal(heartbeatPayload{
		Status:  heartbeatStatus(h.delivered, snapshot),
		Version: version,
		Counters: heartbeatCounters{
			Requests: snapshot.requests, Blocked: snapshot.blocked, AgentsSeen: snapshot.agentsSeen,
		},
	})
	if err != nil {
		return beatFailed, fmt.Errorf("failed to marshal heartbeat: %w", err)
	}

	h.presented = credential
	status, answer, err := h.post(ctx, credential, body)
	refused := status == http.StatusUnauthorized || status == http.StatusForbidden
	if refused && h.credential.reread() {
		h.presented = h.credential.current()
		status, answer, err = h.post(ctx, h.presented, body)
		refused = status == http.StatusUnauthorized || status == http.StatusForbidden
	}
	switch {
	case err != nil:
		return beatFailed, err
	case status == http.StatusNotFound:
		return beatNotRegistered, nil
	case refused:
		return beatFailed, fmt.Errorf("heartbeat refused the gateway credential (status %d)", status)
	case status < 200 || status > 299:
		return beatFailed, fmt.Errorf("heartbeat returned status %d", status)
	case !answer.Acknowledged:
		return beatFailed, fmt.Errorf("heartbeat answer (status %d) was not an acknowledgement", status)
	}

	h.delivered = snapshot
	if seconds := answer.NextHeartbeatSeconds; seconds > 0 {
		least, most := int64(minHeartbeatInterval/time.Second), int64(maxHeartbeatInterval/time.Second)
		switch {
		case seconds < least:
			seconds = least
		case seconds > most:
			seconds = most
		}
		h.interval = time.Duration(seconds) * time.Second
	}
	return beatDelivered, nil
}

// post sends a heartbeat body with the given credential. An answer that is
// not JSON leaves answer empty. Errors never carry a response body.
func (h *heartbeat) post(ctx context.Context, credential string, body []byte) (int, heartbeatAnswer, error) {
	var answer heartbeatAnswer
	ctx, cancel := context.WithTimeout(ctx, heartbeatTimeout)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, h.url, bytes.NewReader(body))
	if err != nil {
		return 0, answer, fmt.Errorf("failed to create heartbeat request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zentinelle-Gateway-Credential", credential)
	h.cfg.ApplyIdentityHeaders(req)

	resp, err := h.client.Do(req)
	if err != nil {
		return 0, answer, fmt.Errorf("heartbeat failed: %w", err)
	}
	defer resp.Body.Close()

	raw, err := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if err != nil {
		return 0, answer, fmt.Errorf("failed to read heartbeat answer: %w", err)
	}
	if json.Unmarshal(raw, &answer) != nil {
		answer = heartbeatAnswer{}
	}
	return resp.StatusCode, answer, nil
}

// heartbeatBackoff is the wait after the given number of consecutive failed
// beats: 10s, doubling, at most five minutes.
func heartbeatBackoff(failures int) time.Duration {
	delay := minHeartbeatInterval
	for i := 1; i < failures && delay < maxHeartbeatBackoff; i++ {
		delay *= 2
	}
	if delay > maxHeartbeatBackoff {
		return maxHeartbeatBackoff
	}
	return delay
}

// jitter moves d by up to a tenth either way, so gateways started together do
// not keep reporting together.
func jitter(d time.Duration) time.Duration {
	spread := int64(d / 10)
	if spread <= 0 {
		return d
	}
	return d + time.Duration(rand.Int64N(2*spread+1)-spread)
}

// waitFor waits d, or until ctx ends, and reports whether it waited d.
func waitFor(ctx context.Context, d time.Duration) bool {
	timer := time.NewTimer(d)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
