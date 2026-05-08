package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"
)

// UsageData holds extracted token usage from a provider response.
type UsageData struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
}

// UsageEvent is the event payload sent to Zentinelle for usage tracking.
type UsageEvent struct {
	AgentID string     `json:"agent_id"`
	Events  []EventRow `json:"events"`
}

// EventRow is a single event in the batch sent to Zentinelle.
type EventRow struct {
	Type      string                 `json:"type"`
	Timestamp string                 `json:"timestamp"`
	Category  string                 `json:"category"`
	Payload   map[string]interface{} `json:"payload"`
}

// ExtractUsage parses token usage from a provider response body.
// Handles both streaming (SSE) and non-streaming JSON responses.
func ExtractUsage(body []byte, provider string) UsageData {
	if len(body) == 0 {
		return UsageData{}
	}

	bodyStr := string(body)

	// SSE streaming response — scan for usage in data lines
	if strings.HasPrefix(bodyStr, "data: ") || strings.Contains(bodyStr[:min(100, len(bodyStr))], "\ndata: ") {
		return extractSSEUsage(bodyStr, provider)
	}

	// Non-streaming JSON response
	return extractJSONUsage(body, provider)
}

func extractSSEUsage(body string, provider string) UsageData {
	var usage UsageData

	// Walk SSE lines in reverse order — usage is typically in the last few chunks
	lines := strings.Split(body, "\n")
	for i := len(lines) - 1; i >= 0; i-- {
		line := lines[i]
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		dataStr := strings.TrimPrefix(line, "data: ")
		dataStr = strings.TrimSpace(dataStr)
		if dataStr == "[DONE]" {
			continue
		}

		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(dataStr), &chunk); err != nil {
			continue
		}

		usageMap, ok := chunk["usage"].(map[string]interface{})
		if !ok {
			continue
		}

		usage = parseUsageMap(usageMap, provider)
		if usage.PromptTokens > 0 || usage.CompletionTokens > 0 {
			return usage
		}
	}

	return usage
}

func extractJSONUsage(body []byte, provider string) UsageData {
	var parsed map[string]interface{}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return UsageData{}
	}

	usageMap, ok := parsed["usage"].(map[string]interface{})
	if !ok {
		return UsageData{}
	}

	return parseUsageMap(usageMap, provider)
}

func parseUsageMap(usageMap map[string]interface{}, provider string) UsageData {
	var usage UsageData

	switch provider {
	case "anthropic":
		usage.PromptTokens = jsonInt(usageMap, "input_tokens")
		usage.CompletionTokens = jsonInt(usageMap, "output_tokens")
	case "openai":
		usage.PromptTokens = jsonInt(usageMap, "prompt_tokens")
		usage.CompletionTokens = jsonInt(usageMap, "completion_tokens")
	case "google":
		usage.PromptTokens = jsonInt(usageMap, "promptTokenCount")
		usage.CompletionTokens = jsonInt(usageMap, "candidatesTokenCount")
		// Fall back to snake_case fields
		if usage.PromptTokens == 0 {
			usage.PromptTokens = jsonInt(usageMap, "prompt_token_count")
		}
		if usage.CompletionTokens == 0 {
			usage.CompletionTokens = jsonInt(usageMap, "candidates_token_count")
		}
	default:
		// Try all known field names
		usage.PromptTokens = jsonInt(usageMap, "prompt_tokens")
		if usage.PromptTokens == 0 {
			usage.PromptTokens = jsonInt(usageMap, "input_tokens")
		}
		usage.CompletionTokens = jsonInt(usageMap, "completion_tokens")
		if usage.CompletionTokens == 0 {
			usage.CompletionTokens = jsonInt(usageMap, "output_tokens")
		}
	}

	return usage
}

// jsonInt extracts an integer from a JSON map, handling float64 (the default JSON number type).
func jsonInt(m map[string]interface{}, key string) int {
	v, ok := m[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case int64:
		return int(n)
	default:
		return 0
	}
}

// ReportUsage asynchronously sends usage data to Zentinelle.
// Fire-and-forget: errors are logged, never block the caller.
func ReportUsage(cfg *Config, agentKey string, provider string, model string, usage UsageData, latencyMs int64, requestID string) {
	go func() {
		event := UsageEvent{
			AgentID: "", // Zentinelle resolves from the key
			Events: []EventRow{
				{
					Type:      "llm:usage",
					Timestamp: time.Now().UTC().Format(time.RFC3339),
					Category:  "telemetry",
					Payload: map[string]interface{}{
						"provider":          provider,
						"model":             model,
						"prompt_tokens":     usage.PromptTokens,
						"completion_tokens": usage.CompletionTokens,
						"total_tokens":      usage.PromptTokens + usage.CompletionTokens,
						"latency_ms":        latencyMs,
						"request_id":        requestID,
						"source":            "gateway",
					},
				},
			},
		}

		body, err := json.Marshal(event)
		if err != nil {
			logJSON("warn", "failed to marshal usage event", map[string]interface{}{
				"error":      err.Error(),
				"request_id": requestID,
			})
			return
		}

		url := cfg.ZentinelleURL + "/api/zentinelle/v1/events"
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			logJSON("warn", "failed to create usage request", map[string]interface{}{
				"error":      err.Error(),
				"request_id": requestID,
			})
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Zentinelle-Key", agentKey)

		client := &http.Client{Timeout: 5 * time.Second}
		resp, err := client.Do(req)
		if err != nil {
			logJSON("warn", "failed to report usage", map[string]interface{}{
				"error":      err.Error(),
				"request_id": requestID,
			})
			return
		}
		defer resp.Body.Close()
		io.ReadAll(io.LimitReader(resp.Body, 1024)) // drain

		if resp.StatusCode >= 300 {
			logJSON("warn", "usage report rejected", map[string]interface{}{
				"status":     resp.StatusCode,
				"request_id": requestID,
			})
		}
	}()
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
