package main

import (
	"bytes"
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

// controlPlaneRoutes are the only paths the gateway passes straight through to
// the Astrolift control plane (#445): an agent task's state and event callback
// (its heartbeat and its event stream share it) and the keep-alive agent's
// cluster heartbeat. Each id segment is one plain path segment, so no
// encoded slash, dot segment or query reaches the control plane under them.
var controlPlaneRoutes = regexp.MustCompile(
	`^/api/(dispatch/v1/agents/[A-Za-z0-9_-]+/callback|clusters/v1/[A-Za-z0-9_-]+/heartbeat)/$`)

// controlPlaneTimeout bounds one passed-through call. The agents give up on
// theirs after 15 seconds.
const controlPlaneTimeout = 30 * time.Second

// isControlPlaneRoute reports whether a request is one the gateway passes
// through. Nothing is when no control plane is configured.
func (g *Gateway) isControlPlaneRoute(r *http.Request) bool {
	return g.cfg.ControlPlaneURL != "" && controlPlaneRoutes.MatchString(r.URL.EscapedPath())
}

// handlePassthrough forwards an agent's heartbeat or events to the control
// plane without the policy check, the provider key lookup or metering, so a
// degraded Zentinelle does not make a live agent look like an outage. The
// control plane authenticates the call: only the agent's Authorization and
// Content-Type are sent on, and only to the configured control plane.
func (g *Gateway) handlePassthrough(w http.ResponseWriter, r *http.Request) {
	requestID := generateRequestID()
	w.Header().Set("X-Request-ID", requestID)

	if r.Method != http.MethodPost {
		writeJSONError(w, http.StatusMethodNotAllowed, "method_not_allowed", "POST only")
		return
	}
	auth := r.Header.Get("Authorization")
	if !strings.HasPrefix(auth, "Bearer ") || strings.TrimSpace(strings.TrimPrefix(auth, "Bearer ")) == "" {
		writeJSONError(w, http.StatusUnauthorized, "missing_key", "Authorization: Bearer is required")
		return
	}

	maxBytes := g.cfg.MaxResponseBytes
	if maxBytes <= 0 {
		maxBytes = 52428800
	}
	var body []byte
	if r.Body != nil {
		var err error
		body, err = io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
		if err != nil {
			writeJSONError(w, http.StatusBadRequest, "body_read_error", "failed to read request body")
			return
		}
	}
	if int64(len(body)) > maxBytes {
		writeJSONError(w, http.StatusRequestEntityTooLarge, "request_too_large", "request exceeds configured limit")
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), controlPlaneTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, g.cfg.ControlPlaneURL+r.URL.EscapedPath(), bytes.NewReader(body))
	if err != nil {
		writeJSONError(w, http.StatusInternalServerError, "internal_error", "failed to build control plane request")
		return
	}
	req.Header.Set("Authorization", auth)
	if ct := r.Header.Get("Content-Type"); ct != "" {
		req.Header.Set("Content-Type", ct)
	}

	resp, err := g.client.Do(req)
	if err != nil {
		logJSON("error", "control plane unreachable", map[string]interface{}{
			"request_id": requestID,
			"path":       r.URL.Path,
			"error":      err.Error(),
		})
		writeJSONError(w, http.StatusBadGateway, "control_plane_error", "control plane unreachable")
		return
	}
	defer resp.Body.Close()

	if ct := resp.Header.Get("Content-Type"); ct != "" {
		w.Header().Set("Content-Type", ct)
	}
	w.WriteHeader(resp.StatusCode)
	io.Copy(w, io.LimitReader(resp.Body, maxBytes))
}

// parseControlPlaneURL accepts the control plane's base URL: http or https, a
// host, and nothing that could carry a credential or bend the path.
func parseControlPlaneURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil || (u.Scheme != "http" && u.Scheme != "https") || u.Host == "" ||
		u.User != nil || u.RawQuery != "" || u.Fragment != "" || strings.Trim(u.Path, "/") != "" {
		return "", fmt.Errorf("invalid ASTROLIFT_CONTROL_PLANE_URL %q: want http(s)://host[:port]", raw)
	}
	return u.Scheme + "://" + u.Host, nil
}
