package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// PolicyResult holds the outcome of a policy evaluation.
type PolicyResult struct {
	Allowed bool   `json:"allowed"`
	Reason  string `json:"reason"`

	// OutputFilterRequired reports that this tenant has an enabled output
	// filter, so the response must be examined before the caller sees it.
	//
	// The gateway cannot work this out for itself: it holds an agent key, not
	// a database, while the Django proxy queries Policy directly. Without
	// being told, it streamed every response straight through, and an agent
	// connected through the SDK proxy bypassed output filtering that applied
	// to everyone on the Django path (#218).
	OutputFilterRequired bool `json:"output_filter_required"`
}

// PolicyRequest is the body sent to Zentinelle's evaluate endpoint.
type PolicyRequest struct {
	AgentID string                 `json:"agent_id"`
	Action  string                 `json:"action"`
	Context map[string]interface{} `json:"context"`
}

// CheckPolicy evaluates a request against Zentinelle policies.
// On timeout or error, it returns allowed=true if fail-open is configured,
// or allowed=false if fail-closed.
func CheckPolicy(ctx context.Context, cfg *Config, agentKey string, provider string, model string) PolicyResult {
	reqBody := PolicyRequest{
		AgentID: "", // Zentinelle resolves the agent from the key
		Action:  "llm:invoke",
		Context: map[string]interface{}{
			"provider": provider,
		},
	}
	if model != "" {
		reqBody.Context["model"] = model
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to marshal policy request: %v", err))
	}

	policyCtx, cancel := context.WithTimeout(ctx, cfg.PolicyTimeout)
	defer cancel()

	url := cfg.ZentinelleURL + "/api/zentinelle/v1/evaluate"
	req, err := http.NewRequestWithContext(policyCtx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to create policy request: %v", err))
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zentinelle-Key", agentKey)

	resp, err := policyClient.Do(req)
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("policy check failed: %v", err))
	}
	defer resp.Body.Close()

	// Read response body with a reasonable limit
	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20)) // 1MB max
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to read policy response: %v", err))
	}

	if resp.StatusCode != http.StatusOK {
		return policyFallback(cfg, fmt.Sprintf("policy check returned status %d: %s", resp.StatusCode, string(respBody)))
	}

	var result PolicyResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to parse policy response: %v", err))
	}

	return result
}

// policyFallback returns the appropriate result when the policy service is unreachable.
func policyFallback(cfg *Config, reason string) PolicyResult {
	if cfg.FailOpen {
		return PolicyResult{
			Allowed: true,
			Reason:  fmt.Sprintf("fail-open: %s", reason),
		}
	}
	return PolicyResult{
		Allowed: false,
		Reason:  fmt.Sprintf("fail-closed: %s", reason),
	}
}

// CheckOutputPolicy evaluates a completed response against the tenant's output
// filters. It is only called when the request-time check reported
// OutputFilterRequired, because it costs the response its incrementality: the
// body has to be whole before it can be judged, so a streamed answer arrives at
// the client in one piece rather than token by token.
//
// The same fail-open/fail-closed rule as the request check applies. An output
// filter exists to stop something leaving, so on a fail-closed deployment a
// filter that cannot be reached withholds the response rather than releasing
// it unexamined.
func CheckOutputPolicy(ctx context.Context, cfg *Config, agentKey string, provider string, model string, output string) PolicyResult {
	reqBody := PolicyRequest{
		AgentID: "",
		Action:  "llm:response",
		Context: map[string]interface{}{
			"provider": provider,
			"output":   output,
		},
	}
	if model != "" {
		reqBody.Context["model"] = model
	}

	bodyBytes, err := json.Marshal(reqBody)
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to marshal output policy request: %v", err))
	}

	policyCtx, cancel := context.WithTimeout(ctx, cfg.PolicyTimeout)
	defer cancel()

	url := cfg.ZentinelleURL + "/api/zentinelle/v1/evaluate"
	req, err := http.NewRequestWithContext(policyCtx, http.MethodPost, url, bytes.NewReader(bodyBytes))
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to create output policy request: %v", err))
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zentinelle-Key", agentKey)

	resp, err := policyClient.Do(req)
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("output policy check failed: %v", err))
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to read output policy response: %v", err))
	}

	if resp.StatusCode != http.StatusOK {
		return policyFallback(cfg, fmt.Sprintf("output policy check returned status %d: %s", resp.StatusCode, string(respBody)))
	}

	var result PolicyResult
	if err := json.Unmarshal(respBody, &result); err != nil {
		return policyFallback(cfg, fmt.Sprintf("failed to parse output policy response: %v", err))
	}

	return result
}
