/**
 * Zentinelle's assistant as an AG-UI agent: `/assistant/chat` adapted with
 * `createFunctionAgent` until it speaks AG-UI itself. Each run posts the
 * person's message (with the history, the page and the model the person
 * picked) through `authenticatedFetch`, so the session cookie and the CSRF
 * token go along, and turns the `data:` stream into AG-UI events:
 *
 * - `content` is the answer's text. The server holds it until its output
 *   guardrail passes and then sends it whole, so it arrives in one piece.
 * - `tool_call` and `tool_result` are a tool call and its result.
 * - `pending_action` is an action that waits for an operator: the run ends
 *   on an interrupt (`zentinelle.approval`) carrying its approval token.
 * - `navigation` is a `navigation` custom event: a page to go to.
 * - `error` (a guardrail denial among them) fails the run with its words.
 *
 * Answering an interrupt resumes the run: the outcome the approval card
 * reached (`execute-tool` already ran, as the person) comes back as a
 * `zentinelle.action` custom event, and its navigation as another.
 */
import type { HttpAgent } from "@ag-ui/client";
import {
  createFunctionAgent,
  type AgentRunFunction,
} from "@calliopelabs/ui/agent";

type AgUiEvent = Record<string, unknown> & { type: string };
type RunInput = Parameters<AgentRunFunction>[0];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

/** Why a run waits: an action the assistant proposed, for an operator to approve. */
export const APPROVAL = "zentinelle.approval";
/** How a proposed action ended, as the conversation keeps it. */
export const ACTION = "zentinelle.action";
/** A page the assistant points to. */
export const NAVIGATION = "navigation";

/** What an approval interrupt carries: the action and its approval token. */
export interface ApprovalRequest {
  name: string;
  args: Record<string, unknown>;
  preview: string;
}

/** An action's end, as the approval card answers the interrupt and the conversation shows it. */
export interface ActionOutcome {
  /** The approval token: one card per action. */
  id: string;
  name: string;
  preview: string;
  status: "completed" | "failed" | "rejected";
  result?: unknown;
  error?: string;
}

export interface NavigationTarget {
  path: string;
  label: string;
}

const textOf = (content: unknown): string =>
  typeof content === "string"
    ? content
    : Array.isArray(content)
      ? content
          .map((p: { type?: string; text?: string }) =>
            p?.type === "text" ? (p.text ?? "") : "",
          )
          .join("")
      : "";

let counter = 0;
const id = (prefix: string) =>
  `${prefix}_${Date.now().toString(36)}_${(++counter).toString(36)}`;

function navigationOf(value: unknown): NavigationTarget | null {
  const nav = value as { path?: unknown; label?: unknown } | null;
  if (!nav || typeof nav.path !== "string" || !nav.path) return null;
  return {
    path: nav.path,
    label: typeof nav.label === "string" && nav.label ? nav.label : nav.path,
  };
}

/** The `data:` lines of the chat stream, parsed, as they arrive. */
async function* chatLines(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<Record<string, unknown> | "done"> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          yield "done";
          return;
        }
        try {
          yield JSON.parse(data) as Record<string, unknown>;
        } catch {
          // A malformed line is skipped, as before.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * The assistant as an AG-UI agent over `/assistant/chat`. `fetcher` is the
 * session's `authenticatedFetch`; tests and stories pass their own.
 */
export function createZentinelleAgent(fetcher: typeof fetch): HttpAgent {
  /** Proposed actions by approval token, so an answer (or its cancel) knows what it was about. */
  const proposed = new Map<string, ApprovalRequest>();
  /** The person's messages already answered: a resumed run only answers a new one. */
  const answered = new Set<string>();

  const run = async function* (input: RunInput, signal: AbortSignal) {
    // The approvals answered since the last run: how each ended.
    for (const entry of input.resume ?? []) {
      const asked = proposed.get(entry.interruptId);
      if (!asked) continue;
      proposed.delete(entry.interruptId);
      const answer =
        entry.status === "resolved"
          ? (entry.payload as Partial<ActionOutcome> | undefined)
          : undefined;
      const outcome: ActionOutcome = {
        id: entry.interruptId,
        name: asked.name,
        preview: asked.preview,
        status: answer?.status ?? "rejected",
        ...(answer?.result !== undefined ? { result: answer.result } : {}),
        ...(answer?.error ? { error: answer.error } : {}),
      };
      yield { type: "CUSTOM", name: ACTION, value: outcome } as AgUiEvent;
      const nav = navigationOf(
        (answer?.result as { navigation?: unknown } | undefined)?.navigation,
      );
      if (nav) yield { type: "CUSTOM", name: NAVIGATION, value: nav };
    }

    const last = input.messages.at(-1);
    if (!last || last.role !== "user" || answered.has(last.id)) return;
    answered.add(last.id);
    const message = textOf(last.content).trim();
    if (!message) return;

    const history = input.messages
      .slice(0, -1)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({ role: m.role, content: textOf(m.content) }))
      .filter((m) => m.content);
    const props = (input.forwardedProps ?? {}) as {
      model?: string;
      page?: string;
    };

    let res: Response;
    try {
      res = await fetcher(`${API_URL}/assistant/chat`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          history,
          page_context:
            props.page ??
            (typeof window !== "undefined" ? window.location.pathname : "/"),
          ...(props.model ? { model: props.model } : {}),
        }),
        signal,
      });
    } catch (error) {
      if (signal.aborted) throw error;
      throw new Error("Connection failed. Check that the backend is running.");
    }
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        detail?: string;
      } | null;
      throw new Error(
        body?.detail || body?.error || `Request failed (${res.status})`,
      );
    }
    if (!res.body) throw new Error("No response stream available");

    const messageId = id("msg");
    let started = false;
    const open: { id: string; name: string }[] = [];
    const interrupts: Record<string, unknown>[] = [];

    for await (const line of chatLines(res.body)) {
      if (line === "done") break;
      if (typeof line.error === "string") {
        throw new Error(
          typeof line.detail === "string" && line.detail
            ? line.detail
            : line.error,
        );
      }
      if (typeof line.content === "string" && line.content) {
        if (!started) {
          started = true;
          yield { type: "TEXT_MESSAGE_START", messageId, role: "assistant" };
        }
        yield { type: "TEXT_MESSAGE_CONTENT", messageId, delta: line.content };
      }
      if (typeof line.tool_call === "string") {
        const toolCallId = id("call");
        open.push({ id: toolCallId, name: line.tool_call });
        yield {
          type: "TOOL_CALL_START",
          toolCallId,
          toolCallName: line.tool_call,
        };
        yield {
          type: "TOOL_CALL_ARGS",
          toolCallId,
          delta: JSON.stringify(line.args ?? {}),
        };
        yield { type: "TOOL_CALL_END", toolCallId };
      }
      if (typeof line.tool_result === "string") {
        // The result belongs to the latest call of that name still without one.
        const at = open.map((c) => c.name).lastIndexOf(line.tool_result);
        if (at >= 0) {
          const [call] = open.splice(at, 1);
          yield {
            type: "TOOL_CALL_RESULT",
            messageId: `${call.id}:result`,
            toolCallId: call.id,
            content: JSON.stringify(line.result ?? {}),
          };
        }
      }
      if (
        typeof line.pending_action === "string" &&
        typeof line.hash === "string"
      ) {
        const asked: ApprovalRequest = {
          name: line.pending_action,
          args: (line.args as Record<string, unknown>) ?? {},
          preview: typeof line.preview === "string" ? line.preview : "",
        };
        proposed.set(line.hash, asked);
        interrupts.push({
          id: line.hash,
          reason: APPROVAL,
          message: asked.preview,
          metadata: asked,
        });
      }
      const nav = navigationOf(line.navigation);
      if (nav) yield { type: "CUSTOM", name: NAVIGATION, value: nav };
    }
    if (started) yield { type: "TEXT_MESSAGE_END", messageId };
    if (interrupts.length > 0) {
      yield {
        type: "RUN_FINISHED",
        threadId: input.threadId,
        runId: input.runId,
        outcome: { type: "interrupt", interrupts },
      };
    }
  };
  // The events are built from AG-UI's names as plain objects; the client's verifier checks them.
  return createFunctionAgent(run as unknown as AgentRunFunction);
}
