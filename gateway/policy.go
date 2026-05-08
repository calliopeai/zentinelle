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

	resp, err := http.DefaultClient.Do(req)
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
