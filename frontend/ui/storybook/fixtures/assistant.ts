/**
 * The assistant's turns as `POST /assistant/chat` streams them (the `data:`
 * lines lib/assistant/agent.ts adapts to AG-UI), a stand-in for the routes
 * the assistant calls, and the models `GET /assistant/providers` lists.
 */
import type { ChatModel } from "@/hooks/use-chat";

export const assistantModels: ChatModel[] = [
  {
    value: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
    releaseDate: "2025-05-14",
    supportsTools: true,
  },
  {
    value: "claude-opus-4-20250514",
    label: "Claude Opus 4",
    provider: "Anthropic",
    releaseDate: "2025-05-14",
    supportsTools: true,
  },
  {
    value: "gpt-4o",
    label: "GPT-4o",
    provider: "OpenAI",
    releaseDate: "2024-05-13",
    supportsTools: true,
  },
];

/** `GET /assistant/providers?require_tools=true`, as the backend answers it. */
export const assistantProvidersResponse = {
  providers: [
    {
      name: "Anthropic",
      models: assistantModels.filter((m) => m.provider === "Anthropic"),
    },
    {
      name: "OpenAI",
      models: assistantModels.filter((m) => m.provider === "OpenAI"),
    },
  ],
};

/** One turn of `POST /assistant/chat`: its `data:` lines, before `[DONE]`. */
export type ChatTurn = readonly Record<string, unknown>[];

/** A question answered with a tool, its result and a page to go to. */
export const answerTurn: ChatTurn = [
  { tool_call: "list_policy_violations", args: { since: "today" } },
  { tool_result: "list_policy_violations", result: { count: 2 } },
  { navigation: { path: "/events", label: "Events" } },
  {
    content:
      "Two agents were blocked today:\n\n- **support-bot** sent a prompt with a card number (PII policy).\n- **etl-runner** exceeded its daily token budget.\n\nThe PII policy is in `enforce` mode, so both requests were stopped.",
  },
];

/** The assistant proposes a change and waits for someone to approve it. */
export const proposalTurn: ChatTurn = [
  { content: "I can pause it. Approve to go ahead." },
  {
    pending_action: "pause_agent",
    args: { agent_id: "etl-runner" },
    hash: "a1b2c3",
    preview: "Pause agent etl-runner until 2026-10-17 00:00 UTC",
  },
];

/** The output guardrail stopped the answer. */
export const deniedTurn: ChatTurn = [
  {
    error: "assistant_guardrail_denied",
    detail: "The answer named a customer, which the support policy forbids.",
  },
];

/** A long answer, to show the conversation scrolling. */
export const longTurn: ChatTurn = [
  {
    content: Array.from(
      { length: 12 },
      (_, i) =>
        `**Gap ${i + 1}.** Control ${i + 1} has no evidence attached; the owner is team ${(i % 3) + 1}, open ${i + 3} days.`,
    ).join("\n\n"),
  },
];

/**
 * A fetch that answers the assistant's routes in the page: each chat request
 * with the next turn (the last repeats) as an event stream, `execute-tool`
 * with a success, and the models list.
 */
export function assistantFetch(turns: readonly ChatTurn[]): typeof fetch {
  let turn = 0;
  const encoder = new TextEncoder();
  return async (input, init) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/assistant/execute-tool")) {
      const body = JSON.parse(String(init?.body ?? "{}"));
      return Response.json({
        name: body.name,
        args: body.args,
        result: { success: true },
      });
    }
    if (url.includes("/assistant/providers"))
      return Response.json(assistantProvidersResponse);
    const lines = turns[Math.min(turn++, turns.length - 1)] ?? [];
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const line of lines)
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify(line)}\n\n`),
          );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      },
    });
    return new Response(stream, {
      headers: { "content-type": "text/event-stream" },
    });
  };
}
