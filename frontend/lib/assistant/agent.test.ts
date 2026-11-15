import { describe, expect, it } from "vitest";

import { ACTION, APPROVAL, NAVIGATION, createZentinelleAgent } from "./agent";

type Line = Record<string, unknown>;

/** A fetch that answers `/assistant/chat` with these `data:` lines, and records each request. */
function chat(turns: Line[][], status = 200) {
  const requests: { url: string; body: Record<string, unknown> }[] = [];
  let turn = 0;
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ url: String(input), body: JSON.parse(String(init?.body)) });
    if (status !== 200)
      return Response.json(
        { error: "assistant_guardrail_denied", detail: "Not allowed here." },
        { status },
      );
    const lines = turns[Math.min(turn++, turns.length - 1)];
    const text =
      lines.map((l) => `data: ${JSON.stringify(l)}\n\n`).join("") +
      "data: [DONE]\n\n";
    return new Response(text, {
      headers: { "content-type": "text/event-stream" },
    });
  }) as typeof fetch;
  return { fetcher, requests };
}

async function ask(
  agent: ReturnType<typeof createZentinelleAgent>,
  text: string | null,
  params: Record<string, unknown> = {},
) {
  if (text)
    agent.addMessage({ id: crypto.randomUUID(), role: "user", content: text });
  const events: { type: string; [k: string]: unknown }[] = [];
  let error: unknown = null;
  await agent
    .runAgent(params, {
      onEvent: ({ event }) => {
        events.push(event as never);
      },
    })
    .catch((e: unknown) => {
      error = e;
    });
  return { events, error };
}

describe("the assistant's AG-UI adapter", () => {
  it("posts the message, history, page and model, and streams the answer", async () => {
    const { fetcher, requests } = chat([
      [
        { tool_call: "list_events", args: { limit: 5 } },
        { tool_result: "list_events", result: { count: 2 } },
        { navigation: { path: "/events", label: "Events" } },
        { content: "Two events." },
      ],
    ]);
    const agent = createZentinelleAgent(fetcher);
    const { events } = await ask(agent, "What happened?", {
      forwardedProps: { model: "gpt-4o", page: "/agents" },
    });
    expect(requests[0].url).toMatch(/\/assistant\/chat$/);
    expect(requests[0].body).toMatchObject({
      message: "What happened?",
      history: [],
      page_context: "/agents",
      model: "gpt-4o",
    });
    const types = events.map((e) => e.type);
    expect(types).toContain("TOOL_CALL_START");
    expect(types).toContain("TOOL_CALL_RESULT");
    expect(
      events.find((e) => e.type === "CUSTOM" && e.name === NAVIGATION)?.value,
    ).toEqual({ path: "/events", label: "Events" });
    expect(events.find((e) => e.type === "TEXT_MESSAGE_CONTENT")?.delta).toBe(
      "Two events.",
    );
    expect(types.at(-1)).toBe("RUN_FINISHED");

    // The next turn carries the conversation so far as history.
    await ask(agent, "And yesterday?");
    expect(requests[1].body.history).toEqual([
      { role: "user", content: "What happened?" },
      { role: "assistant", content: "Two events." },
    ]);
  });

  it("ends on an approval interrupt, and a resume reports how it ended without asking again", async () => {
    const { fetcher, requests } = chat([
      [
        { content: "Approve to pause it." },
        {
          pending_action: "pause_agent",
          args: { agent_id: "etl" },
          hash: "tok1",
          preview: "Pause etl",
        },
      ],
    ]);
    const agent = createZentinelleAgent(fetcher);
    const first = await ask(agent, "Pause etl");
    const finished = first.events.find((e) => e.type === "RUN_FINISHED") as {
      outcome?: { type: string; interrupts: { id: string; reason: string }[] };
    };
    expect(finished.outcome?.type).toBe("interrupt");
    expect(finished.outcome?.interrupts[0]).toMatchObject({
      id: "tok1",
      reason: APPROVAL,
    });

    const second = await ask(agent, null, {
      resume: [
        {
          interruptId: "tok1",
          status: "resolved",
          payload: {
            status: "completed",
            result: { success: true, navigation: { path: "/agents/etl" } },
          },
        },
      ],
    });
    expect(requests).toHaveLength(1);
    const custom = second.events.filter((e) => e.type === "CUSTOM");
    expect(custom[0]).toMatchObject({
      name: ACTION,
      value: { id: "tok1", name: "pause_agent", status: "completed" },
    });
    expect(custom[1]).toMatchObject({
      name: NAVIGATION,
      value: { path: "/agents/etl", label: "/agents/etl" },
    });
  });

  it("fails the run with the guardrail's words, on refusal and mid-stream", async () => {
    const refused = await ask(
      createZentinelleAgent(chat([[]], 422).fetcher),
      "anything",
    );
    expect(refused.events.find((e) => e.type === "RUN_ERROR")?.message).toBe(
      "Not allowed here.",
    );

    const denied = await ask(
      createZentinelleAgent(
        chat([
          [
            {
              error: "assistant_guardrail_denied",
              detail: "Named a customer.",
            },
          ],
        ]).fetcher,
      ),
      "anything",
    );
    expect(denied.events.find((e) => e.type === "RUN_ERROR")?.message).toBe(
      "Named a customer.",
    );
  });
});
