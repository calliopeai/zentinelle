package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"strconv"
)

// Interaction logging: the prompt and the completion, sent to Zentinelle after
// the response has already gone to the caller.
//
// The Django proxy has always written a full InteractionLog; the gateway
// reported token counts and nothing else, so an agent routed through the SDK
// proxy had no reasoning traces in the portal at all while an identical agent
// on the other path did (#225). This closes the same kind of gap #218 closed
// for output filtering.
//
// On by default, because the alternative is two paths through one product that
// record different things, which is what made this a bug rather than a
// preference. LOG_INTERACTIONS=false turns it off for a deployment that must
// not send prompt text off-cluster, and that is a real requirement rather than
// a hypothetical one — hence the switch.

// interactionLoggingEnabled reports whether prompts and completions should be
// sent. Read per call rather than cached at startup so a deployment that flips
// it does not need a restart to stop sending content.
func interactionLoggingEnabled() bool {
	v := os.Getenv("LOG_INTERACTIONS")
	if v == "" {
		return true
	}
	enabled, err := strconv.ParseBool(v)
	if err != nil {
		// An unparseable value is not permission. Logging prompt content on
		// the strength of a typo is the wrong way to resolve the ambiguity.
		logJSON("warn", "invalid LOG_INTERACTIONS value; interaction logging disabled",
			map[string]interface{}{"value": v})
		return false
	}
	return enabled
}

// InteractionRecord is the body of POST /api/zentinelle/v1/interaction.
//
// The field names are the ones that endpoint reads — `input_token_count` and
// `output_token_count`, not the `prompt_tokens`/`completion_tokens` the issue's
// sample showed. Sending the sample's names would have been accepted with a
// 201 and stored as null, which is the failure that looks like success.
type InteractionRecord struct {
	RequestID        string `json:"request_id"`
	AIProvider       string `json:"ai_provider"`
	AIModel          string `json:"ai_model"`
	InputContent     string `json:"input_content"`
	OutputContent    string `json:"output_content"`
	InputTokenCount  int    `json:"input_token_count"`
	OutputTokenCount int    `json:"output_token_count"`
	LatencyMs        int64  `json:"latency_ms"`
	InteractionType  string `json:"interaction_type"`
}

// LogInteraction sends one interaction, after the fact and without blocking.
//
// Fire-and-forget, like ReportUsage: this runs when the caller already has
// their response, so a slow or unreachable Zentinelle must cost the request
// nothing. A failure is logged and dropped — an interaction log that could not
// be written is not a reason to fail a request that already succeeded.
func LogInteraction(
	cfg *Config,
	agentKey string,
	provider string,
	model string,
	requestBody []byte,
	responseBody []byte,
	streaming bool,
	usage UsageData,
	latencyMs int64,
	requestID string,
) {
	if !interactionLoggingEnabled() {
		return
	}

	go func() {
		output := string(responseBody)
		if streaming {
			// The wire framing is not the conversation. A trace showing
			// `data: {...}` repeated four hundred times is not a trace anyone
			// reads.
			output = sseText(responseBody)
		}

		record := InteractionRecord{
			RequestID:        requestID,
			AIProvider:       provider,
			AIModel:          model,
			InputContent:     string(requestBody),
			OutputContent:    output,
			InputTokenCount:  usage.PromptTokens,
			OutputTokenCount: usage.CompletionTokens,
			LatencyMs:        latencyMs,
			InteractionType:  "chat",
		}

		body, err := json.Marshal(record)
		if err != nil {
			logJSON("warn", "failed to marshal interaction", map[string]interface{}{
				"error": err.Error(), "request_id": requestID,
			})
			return
		}

		url := cfg.ZentinelleURL + "/api/zentinelle/v1/interaction"
		req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
		if err != nil {
			logJSON("warn", "failed to create interaction request", map[string]interface{}{
				"error": err.Error(), "request_id": requestID,
			})
			return
		}

		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Zentinelle-Key", agentKey)
		cfg.ApplyIdentityHeaders(req)

		resp, err := usageClient.Do(req)
		if err != nil {
			logJSON("warn", "failed to log interaction", map[string]interface{}{
				"error": err.Error(), "request_id": requestID,
			})
			return
		}
		defer resp.Body.Close()
		io.ReadAll(io.LimitReader(resp.Body, 1024))

		if resp.StatusCode >= 300 {
			logJSON("warn", "interaction log rejected", map[string]interface{}{
				"status": resp.StatusCode, "request_id": requestID,
			})
		}
	}()
}
