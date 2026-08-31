package main

import "testing"

// The OpenAI Agents SDK calls the Responses API by default, and the Responses
// API reports its token counts under different names and one level deeper than
// Chat Completions. Every case here returned zero before the fix, so an agent
// built on that SDK ran through the gateway metering nothing: cost policies saw
// no cost, and usage limits saw no usage.

func TestResponsesAPIUsageIsCounted(t *testing.T) {
	body := []byte(`{
		"id": "resp_123",
		"object": "response",
		"model": "gpt-5",
		"usage": {"input_tokens": 412, "output_tokens": 87, "total_tokens": 499}
	}`)

	usage := ExtractUsage(body, "openai")

	if usage.PromptTokens != 412 {
		t.Errorf("prompt tokens = %d, want 412", usage.PromptTokens)
	}
	if usage.CompletionTokens != 87 {
		t.Errorf("completion tokens = %d, want 87", usage.CompletionTokens)
	}
}

func TestResponsesAPIStreamingUsageIsCounted(t *testing.T) {
	// The completed event carries usage nested under `response`, not at the
	// top level where the Chat Completions final chunk puts it.
	body := []byte("data: {\"type\":\"response.output_text.delta\",\"delta\":\"hi\"}\n\n" +
		"data: {\"type\":\"response.completed\",\"response\":{\"id\":\"resp_123\"," +
		"\"usage\":{\"input_tokens\":31,\"output_tokens\":9}}}\n\n" +
		"data: [DONE]\n\n")

	usage := ExtractUsage(body, "openai")

	if usage.PromptTokens != 31 {
		t.Errorf("prompt tokens = %d, want 31", usage.PromptTokens)
	}
	if usage.CompletionTokens != 9 {
		t.Errorf("completion tokens = %d, want 9", usage.CompletionTokens)
	}
}

// The fallback must not change what Chat Completions already reported.
func TestChatCompletionsUsageStillCounted(t *testing.T) {
	body := []byte(`{"usage": {"prompt_tokens": 10, "completion_tokens": 20}}`)

	usage := ExtractUsage(body, "openai")

	if usage.PromptTokens != 10 || usage.CompletionTokens != 20 {
		t.Errorf("got %d/%d, want 10/20", usage.PromptTokens, usage.CompletionTokens)
	}
}

// A response that genuinely reports zero stays zero rather than picking up a
// number from the other naming scheme.
func TestZeroUsageStaysZero(t *testing.T) {
	body := []byte(`{"usage": {"prompt_tokens": 0, "completion_tokens": 0}}`)

	usage := ExtractUsage(body, "openai")

	if usage.PromptTokens != 0 || usage.CompletionTokens != 0 {
		t.Errorf("got %d/%d, want 0/0", usage.PromptTokens, usage.CompletionTokens)
	}
}
