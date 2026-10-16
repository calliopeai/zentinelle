package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// UsageData holds extracted token usage from a provider response.
//
// PromptTokens and CompletionTokens are what the provider bills, in total.
// Cached input is inside PromptTokens, and reasoning or thinking output is
// inside CompletionTokens, whatever the provider's own field layout is. The
// cache counts are broken out beside them so pricing can apply cache rates.
type UsageData struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	// CacheReadTokens is input served from the provider's prompt cache:
	// Anthropic cache_read_input_tokens, OpenAI cached_tokens, Gemini
	// cachedContentTokenCount.
	CacheReadTokens int `json:"cache_read_input_tokens"`
	// CacheWriteTokens is input written to the cache (Anthropic
	// cache_creation_input_tokens), which Anthropic bills above the base rate.
	CacheWriteTokens int `json:"cache_creation_input_tokens"`
	// Reported is whether the response carried a usage object at all. A
	// stream that was cut short, or an OpenAI stream without include_usage,
	// reports nothing, and zero then means unknown rather than free.
	Reported bool `json:"-"`
}

// UsageEvent is the event payload sent to Zentinelle for usage tracking.
type UsageEvent struct {
	AgentID string     `json:"agent_id"`
	Events  []EventRow `json:"events"`
}

// EventRow is a single event in the batch sent to Zentinelle.
type EventRow struct {
	Type string `json:"type"`
	// EventID makes a retried delivery a duplicate rather than a second
	// event: the events endpoint deduplicates on it per agent.
	EventID   string                 `json:"event_id,omitempty"`
	Timestamp string                 `json:"timestamp"`
	Category  string                 `json:"category"`
	Payload   map[string]interface{} `json:"payload"`
}

// ExtractUsage parses token usage from a provider response body, which must
// already be decoded (see decodeBody).
//
// Usage is spread over several events in a stream, so every usage object is
// read and merged rather than only the last: an Anthropic stream carries the
// input counts in message_start and the output count in message_delta, and a
// Gemini stream repeats cumulative usageMetadata in every chunk. Each field
// takes the largest value seen, which is right for all three because every
// count they stream is cumulative.
func ExtractUsage(body []byte, provider string) UsageData {
	var usage UsageData
	for _, usageMap := range usageMaps(body) {
		usage = mergeUsage(usage, parseUsageMap(usageMap, provider))
	}
	return usage
}

// usageMaps returns every usage object in a response: one for a JSON body,
// one per element of a JSON array (Gemini streamGenerateContent without
// alt=sse), and one per SSE event that carries one.
func usageMaps(body []byte) []map[string]interface{} {
	trimmed := bytes.TrimSpace(body)
	if len(trimmed) == 0 {
		return nil
	}

	var objects []map[string]interface{}
	switch trimmed[0] {
	case '{':
		var parsed map[string]interface{}
		if json.Unmarshal(trimmed, &parsed) == nil {
			objects = append(objects, parsed)
		}
	case '[':
		var parsed []map[string]interface{}
		if json.Unmarshal(trimmed, &parsed) == nil {
			objects = parsed
		}
	default:
		for _, line := range strings.Split(string(body), "\n") {
			line = strings.TrimSpace(line)
			if !strings.HasPrefix(line, "data:") {
				continue
			}
			data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
			// Only events that mention usage are worth decoding; on a long
			// stream that is one or two lines out of thousands.
			if !strings.Contains(data, "sage") {
				continue
			}
			var chunk map[string]interface{}
			if json.Unmarshal([]byte(data), &chunk) == nil {
				objects = append(objects, chunk)
			}
		}
	}

	var maps []map[string]interface{}
	for _, object := range objects {
		if usageMap, ok := usageMapIn(object); ok {
			maps = append(maps, usageMap)
		}
	}
	return maps
}

func mergeUsage(a, b UsageData) UsageData {
	return UsageData{
		PromptTokens:     max(a.PromptTokens, b.PromptTokens),
		CompletionTokens: max(a.CompletionTokens, b.CompletionTokens),
		CacheReadTokens:  max(a.CacheReadTokens, b.CacheReadTokens),
		CacheWriteTokens: max(a.CacheWriteTokens, b.CacheWriteTokens),
		Reported:         a.Reported || b.Reported,
	}
}

// usageMapIn finds the usage object in a decoded response or SSE event.
//
// OpenAI has two shapes. Chat Completions puts `usage` at the top level, both
// in the final JSON and in the last SSE chunk. The Responses API, which is what
// the OpenAI Agents SDK calls by default, wraps it: the completed event is
// `{"type":"response.completed","response":{...,"usage":{...}}}` and the
// non-streaming body is a response object whose usage is its own field. Reading
// only the top level therefore metered every Agents SDK call as zero tokens,
// which is a billing and quota hole rather than a cosmetic one: cost policies
// and usage limits are evaluated on numbers that were never collected.
//
// Anthropic's message_start event nests it the same way under `message`, and
// Gemini calls it `usageMetadata`.
func usageMapIn(parsed map[string]interface{}) (map[string]interface{}, bool) {
	if usage, ok := parsed["usage"].(map[string]interface{}); ok {
		return usage, true
	}
	if usage, ok := parsed["usageMetadata"].(map[string]interface{}); ok {
		return usage, true
	}
	for _, wrapper := range []string{"response", "message"} {
		if inner, ok := parsed[wrapper].(map[string]interface{}); ok {
			if usage, ok := inner["usage"].(map[string]interface{}); ok {
				return usage, true
			}
		}
	}
	return nil, false
}

func parseUsageMap(usageMap map[string]interface{}, provider string) UsageData {
	usage := UsageData{Reported: true}

	switch provider {
	case "anthropic":
		// input_tokens counts only the uncached remainder of the prompt. The
		// cache reads and writes are billed on top of it, and on a cached
		// workload they are nearly all of it.
		usage.CacheWriteTokens = jsonInt(usageMap, "cache_creation_input_tokens")
		usage.CacheReadTokens = jsonInt(usageMap, "cache_read_input_tokens")
		usage.PromptTokens = jsonInt(usageMap, "input_tokens") + usage.CacheWriteTokens + usage.CacheReadTokens
		usage.CompletionTokens = jsonInt(usageMap, "output_tokens")
	case "openai":
		usage.PromptTokens = jsonInt(usageMap, "prompt_tokens")
		usage.CompletionTokens = jsonInt(usageMap, "completion_tokens")
		// The Responses API names the same two counts `input_tokens` and
		// `output_tokens`. Same provider, same account, different endpoint.
		if usage.PromptTokens == 0 {
			usage.PromptTokens = jsonInt(usageMap, "input_tokens")
		}
		if usage.CompletionTokens == 0 {
			usage.CompletionTokens = jsonInt(usageMap, "output_tokens")
		}
		// Cached tokens are already inside the prompt count; reasoning tokens
		// are already inside the completion count.
		for _, details := range []string{"prompt_tokens_details", "input_tokens_details"} {
			if d, ok := usageMap[details].(map[string]interface{}); ok && usage.CacheReadTokens == 0 {
				usage.CacheReadTokens = jsonInt(d, "cached_tokens")
			}
		}
	case "google":
		// Gemini bills thinking as output and tool-use prompts as input, and
		// counts neither in candidatesTokenCount or promptTokenCount.
		// cachedContentTokenCount is inside promptTokenCount.
		usage.PromptTokens = jsonIntEither(usageMap, "promptTokenCount", "prompt_token_count") +
			jsonIntEither(usageMap, "toolUsePromptTokenCount", "tool_use_prompt_token_count")
		usage.CompletionTokens = jsonIntEither(usageMap, "candidatesTokenCount", "candidates_token_count") +
			jsonIntEither(usageMap, "thoughtsTokenCount", "thoughts_token_count")
		usage.CacheReadTokens = jsonIntEither(usageMap, "cachedContentTokenCount", "cached_content_token_count")
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

// jsonIntEither reads a count under its camelCase name, or the snake_case one
// when the first is absent or zero.
func jsonIntEither(m map[string]interface{}, camel, snake string) int {
	if n := jsonInt(m, camel); n != 0 {
		return n
	}
	return jsonInt(m, snake)
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

// Usage outcomes: how the proxied call ended. Every call that reached the
// provider is reported, because the provider bills it whether or not the
// caller got the answer.
const (
	outcomeCompleted          = "completed"
	outcomeOutputFiltered     = "output_filtered"
	outcomeInspectionFailed   = "inspection_failed"
	outcomeClientDisconnected = "client_disconnected"
	outcomeResponseTooLarge   = "response_too_large"
	outcomeUpstreamReadFailed = "upstream_read_failed"
)

// usageRetryDelays are the waits before each retry of a usage report that
// failed for a reason a retry can fix. The event ID makes a retry that
// follows a lost response a duplicate, not a second charge.
var usageRetryDelays = []time.Duration{500 * time.Millisecond, 2 * time.Second, 5 * time.Second}

// pendingUsageReports counts reports still in flight, so shutdown can wait
// for them instead of dropping them with the process.
var pendingUsageReports atomic.Int64

// drainUsageReports waits for in-flight usage reports, or for ctx to end.
// It returns false if reports were still pending when ctx ended.
func drainUsageReports(ctx context.Context) bool {
	tick := time.NewTicker(10 * time.Millisecond)
	defer tick.Stop()
	for pendingUsageReports.Load() > 0 {
		select {
		case <-ctx.Done():
			return false
		case <-tick.C:
		}
	}
	return true
}

// ReportUsage asynchronously sends usage data to Zentinelle.
// It never blocks the caller. Failures that a retry can fix (no response, a
// 5xx, a 429) are retried; everything else is logged and dropped.
func ReportUsage(cfg *Config, agentKey string, provider string, model string, usage UsageData, latencyMs int64, requestID string, upstreamStatus int, outcome string) {
	event := UsageEvent{
		AgentID: "", // Zentinelle resolves from the key
		Events: []EventRow{
			{
				Type:      "llm:usage",
				EventID:   "gateway-usage-" + requestID,
				Timestamp: time.Now().UTC().Format(time.RFC3339),
				Category:  "telemetry",
				Payload: map[string]interface{}{
					"provider":                    provider,
					"model":                       model,
					"prompt_tokens":               usage.PromptTokens,
					"completion_tokens":           usage.CompletionTokens,
					"total_tokens":                usage.PromptTokens + usage.CompletionTokens,
					"cache_read_input_tokens":     usage.CacheReadTokens,
					"cache_creation_input_tokens": usage.CacheWriteTokens,
					"usage_reported":              usage.Reported,
					"outcome":                     outcome,
					"upstream_status":             upstreamStatus,
					"latency_ms":                  latencyMs,
					"request_id":                  requestID,
					"source":                      "gateway",
				},
			},
		},
	}

	// Marshalled once, so every retry sends the same bytes and the backend
	// sees a duplicate rather than a conflicting reuse of the event ID.
	body, err := json.Marshal(event)
	if err != nil {
		logJSON("warn", "failed to marshal usage event", map[string]interface{}{
			"error":      err.Error(),
			"request_id": requestID,
		})
		return
	}

	delays := usageRetryDelays
	pendingUsageReports.Add(1)
	go func() {
		defer pendingUsageReports.Add(-1)
		for attempt := 0; ; attempt++ {
			retry := sendUsageReport(cfg, agentKey, body, requestID)
			if !retry {
				return
			}
			if attempt >= len(delays) {
				logJSON("error", "usage report dropped after retries", map[string]interface{}{
					"request_id": requestID,
					"attempts":   attempt + 1,
				})
				return
			}
			time.Sleep(delays[attempt])
		}
	}()
}

// sendUsageReport makes one delivery attempt and reports whether it is worth
// another.
func sendUsageReport(cfg *Config, agentKey string, body []byte, requestID string) bool {
	url := cfg.ZentinelleURL + "/api/zentinelle/v1/events"
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		logJSON("warn", "failed to create usage request", map[string]interface{}{
			"error":      err.Error(),
			"request_id": requestID,
		})
		return false
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Zentinelle-Key", agentKey)
	cfg.ApplyIdentityHeaders(req)

	resp, err := usageClient.Do(req)
	if err != nil {
		logJSON("warn", "failed to report usage", map[string]interface{}{
			"error":      err.Error(),
			"request_id": requestID,
		})
		return true
	}
	defer resp.Body.Close()
	io.ReadAll(io.LimitReader(resp.Body, 1024)) // drain

	if resp.StatusCode >= 300 {
		logJSON("warn", "usage report rejected", map[string]interface{}{
			"status":     resp.StatusCode,
			"request_id": requestID,
		})
		return resp.StatusCode >= 500 || resp.StatusCode == http.StatusTooManyRequests
	}
	return false
}
