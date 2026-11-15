/**
 * The assistant's conversation as `useChat` (hooks/use-chat.ts) holds it,
 * built from the events `POST /assistant/chat` streams, and the models
 * `GET /assistant/providers` lists.
 */
import type { ChatModel, Message } from "@/hooks/use-chat";

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

const at = new Date("2026-10-16T15:00:00Z");

const question: Message = {
  id: "m1",
  role: "user",
  content: "Which agents broke a policy today?",
  timestamp: at,
};

const answer: Message = {
  id: "m2",
  role: "assistant",
  content:
    "Two agents were blocked today:\n\n- **support-bot** sent a prompt with a card number (PII policy).\n- **etl-runner** exceeded its daily token budget.\n\nThe PII policy is in `enforce` mode, so both requests were stopped.",
  timestamp: at,
  toolCalls: [
    {
      name: "list_policy_violations",
      args: { since: "today" },
      result: { count: 2 },
    },
  ],
  navigation: [{ path: "/events", label: "Events" }],
};

export const conversation: Message[] = [question, answer];

/** The answer is arriving: a tool is running, no text yet. */
export const streaming: Message[] = [
  question,
  {
    id: "m2",
    role: "assistant",
    content: "",
    timestamp: at,
    toolCalls: [{ name: "list_policy_violations", args: { since: "today" } }],
  },
];

/** The assistant proposes a change and waits for someone to approve it. */
export const pendingApproval: Message[] = [
  {
    id: "m1",
    role: "user",
    content: "Pause etl-runner until tomorrow.",
    timestamp: at,
  },
  {
    id: "m2",
    role: "assistant",
    content: "I can pause it. Approve to go ahead.",
    timestamp: at,
    pendingActions: [
      {
        name: "pause_agent",
        args: { agent_id: "etl-runner" },
        hash: "a1b2c3",
        preview: "Pause agent etl-runner until 2026-10-17 00:00 UTC",
        status: "pending",
      },
    ],
  },
];

export const settledActions: Message[] = [
  pendingApproval[0],
  {
    ...pendingApproval[1],
    pendingActions: [
      { ...pendingApproval[1].pendingActions![0], status: "completed" },
      {
        name: "notify_owner",
        args: {},
        hash: "d4e5f6",
        preview: "Tell the owner of etl-runner",
        status: "rejected",
      },
    ],
  },
];

export const longConversation: Message[] = [
  {
    id: "m1",
    role: "user",
    content:
      "Summarize every compliance gap we have across SOC 2, GDPR, HIPAA, the EU AI Act and NIST AI RMF, grouped by owner, with the controls that would close each one and how long each has been open.",
    timestamp: at,
  },
  {
    id: "m2",
    role: "assistant",
    content: Array.from(
      { length: 12 },
      (_, i) =>
        `${i + 1}. **Control CC${i + 1}.${i}**: evidence for agent-${"x".repeat(40)}-${i} is missing since the last review.`,
    ).join("\n"),
    timestamp: at,
    toolCalls: [
      {
        name: "list_compliance_gaps",
        args: { frameworks: ["soc2", "gdpr", "hipaa", "eu_ai_act", "nist"] },
        result: { missing_count: 12 },
      },
    ],
  },
];
