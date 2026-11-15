"use client";

import { Button, StatusBadge, cn, useUI } from "@calliopelabs/ui";
import type {
  AgentRenderers,
  CustomRendererProps,
  InterruptRendererProps,
} from "@calliopelabs/ui/agent";
import { ExternalLinkIcon, WrenchIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import {
  ACTION,
  APPROVAL,
  NAVIGATION,
  type ActionOutcome,
  type ApprovalRequest,
  type NavigationTarget,
} from "@/lib/assistant/agent";

/**
 * What the approval card may do: whether the person may approve (operators
 * and admins), and the approved action's run, as the person
 * (`POST /assistant/execute-tool` with the approval token). The connected
 * provider supplies it; a story passes its own.
 */
export interface AssistantActions {
  canMutate: boolean;
  execute: (
    request: ApprovalRequest & { token: string },
  ) => Promise<Omit<ActionOutcome, "id" | "name" | "preview">>;
}

export const AssistantActionsContext = React.createContext<AssistantActions>({
  canMutate: false,
  execute: async () => ({ status: "failed", error: "No assistant here" }),
});

/* Markdown images never render as <img>: the browser would fetch an image's
 * URL as soon as the message showed, with nobody choosing to open it, and the
 * portal loads no remote images. Each one renders as a link to the image, or
 * as its text when it is already inside a link, so nothing is requested until
 * someone clicks. */
const InsideMarkdownLink = React.createContext(false);

function MarkdownImage({ src, alt }: React.ComponentProps<"img">) {
  const t = useTranslations("overview.assistant");
  const insideLink = React.useContext(InsideMarkdownLink);
  const url = typeof src === "string" ? src : "";
  const label = alt || url || t("message.image");
  if (!url || insideLink) return <>{label}</>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      {label}
    </a>
  );
}

const MARKDOWN: Components = {
  p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
  ul: ({ children }) => (
    <ul className="my-1.5 list-disc space-y-0.5 pl-4">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="my-1.5 list-decimal space-y-0.5 pl-4">{children}</ol>
  ),
  li: ({ children }) => <li className="leading-snug">{children}</li>,
  strong: ({ children }) => (
    <strong className="text-foreground font-semibold">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  code: ({ children }) => (
    <code className="bg-background/60 rounded px-1 py-0.5 font-mono text-xs">
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="bg-background/80 my-1.5 overflow-x-auto rounded p-2 text-xs">
      {children}
    </pre>
  ),
  h1: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="mt-2 mb-1 font-semibold">{children}</p>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline underline-offset-2"
    >
      <InsideMarkdownLink.Provider value={true}>
        {children}
      </InsideMarkdownLink.Provider>
    </a>
  ),
  img: MarkdownImage,
};

/** The assistant's words as markdown: the agent's `renderContent`. */
export function MarkdownContent({ content }: { content: string }) {
  // Strip emojis: defense in depth in case the model ignores its instructions.
  const cleaned = content.replace(
    /[\u{1F300}-\u{1F9FF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{2300}-\u{23FF}]/gu,
    "",
  );
  return (
    <div className="text-sm leading-relaxed break-words">
      <ReactMarkdown components={MARKDOWN}>{cleaned}</ReactMarkdown>
    </div>
  );
}

/** A page the assistant points to: a link chip, in the app's own router. */
export function NavigationChip({
  value,
}: Pick<CustomRendererProps<NavigationTarget>, "value">) {
  const { Link } = useUI();
  const t = useTranslations("overview.assistant");
  return (
    <nav aria-label={t("message.suggestedPages")}>
      <Link
        href={value.path}
        className="bg-primary/15 hover:bg-primary/25 text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
      >
        <ExternalLinkIcon aria-hidden className="size-3" />
        <span>{value.label}</span>
      </Link>
    </nav>
  );
}

/** A tool result in a few words, as a message of `overview.assistant.tool`. */
function resultSummary(
  result: unknown,
): { key: string; values?: Record<string, string | number> } | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  if (r.error)
    return { key: "error", values: { message: String(r.error).slice(0, 60) } };
  if (r.success) return { key: "done" };
  if (typeof r.count === "number")
    return { key: "results", values: { count: r.count } };
  if (typeof r.missing_count === "number")
    return { key: "gaps", values: { count: r.missing_count } };
  return null;
}

const ACTION_TONE = {
  pending: "warn",
  approved: "info",
  completed: "ok",
  failed: "error",
  rejected: "muted",
} as const;

type ActionStatus = keyof typeof ACTION_TONE;

function ActionFrame({
  preview,
  status,
  children,
}: {
  preview: string;
  status: ActionStatus;
  children?: React.ReactNode;
}) {
  const t = useTranslations("overview.assistant");
  return (
    <div
      className={cn(
        "bg-background/40 rounded-md border px-2.5 py-2 text-xs",
        status === "rejected" && "opacity-70",
      )}
    >
      <div className="flex items-start gap-1.5">
        <WrenchIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-foreground font-medium">
            {t("action.confirmationRequired")}
          </div>
          <div className="text-muted-foreground break-words">{preview}</div>
        </div>
        {status !== "pending" && (
          <StatusBadge tone={ACTION_TONE[status]}>
            {t(`action.status.${status}`)}
          </StatusBadge>
        )}
      </div>
      {children}
    </div>
  );
}

/**
 * An action the assistant proposed, waiting on a person: Approve runs it as
 * them through `execute-tool` with its approval token and then answers the
 * run's interrupt with how it ended; Cancel answers that it was turned down.
 * Only operators and admins see the buttons.
 */
export function ApprovalCard({ interrupt, resolve }: InterruptRendererProps) {
  const t = useTranslations("overview.assistant");
  const { canMutate, execute } = React.useContext(AssistantActionsContext);
  const asked = interrupt.metadata as unknown as ApprovalRequest;
  const preview = asked?.preview || interrupt.message || "";
  const [running, setRunning] = React.useState(false);
  const approve = async () => {
    setRunning(true);
    const outcome = await execute({ ...asked, token: interrupt.id }).catch(
      () => ({
        status: "failed" as const,
        error: t("action.executeFailed"),
      }),
    );
    resolve(outcome);
  };
  return (
    <ActionFrame preview={preview} status={running ? "approved" : "pending"}>
      {running ? null : canMutate ? (
        <div className="mt-2 flex gap-1.5">
          <Button size="xs" onClick={() => void approve()}>
            {t("action.approve")}
          </Button>
          <Button
            size="xs"
            variant="ghost"
            onClick={() => resolve({ status: "rejected" })}
          >
            {t("action.reject")}
          </Button>
        </div>
      ) : (
        <p className="text-muted-foreground mt-1.5">{t("action.viewer")}</p>
      )}
    </ActionFrame>
  );
}

/** How a proposed action ended, kept in the conversation. */
export function ActionResult({
  value,
}: Pick<CustomRendererProps<ActionOutcome>, "value">) {
  const t = useTranslations("overview.assistant");
  const summary =
    value.status === "failed" && value.error
      ? { key: "error", values: { message: value.error.slice(0, 60) } }
      : resultSummary(value.result);
  return (
    <ActionFrame preview={value.preview} status={value.status}>
      {summary && (
        <p className="text-muted-foreground mt-1.5 italic">
          {t(`tool.${summary.key}`, summary.values)}
        </p>
      )}
    </ActionFrame>
  );
}

/** The assistant's generative UI: page links, approvals and how they ended. */
export const zentinelleRenderers: AgentRenderers = {
  custom: {
    [NAVIGATION]: NavigationChip,
    [ACTION]: ActionResult,
  },
  interrupts: { [APPROVAL]: ApprovalCard },
};
