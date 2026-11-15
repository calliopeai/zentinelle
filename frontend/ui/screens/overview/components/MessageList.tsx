"use client";

import { Button, StatusBadge, cn, useUI } from "@calliopelabs/ui";
import {
  BotIcon,
  CheckIcon,
  ExternalLinkIcon,
  SparklesIcon,
  UserIcon,
  WrenchIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";
import ReactMarkdown, { type Components } from "react-markdown";

import type { Message, PendingAction } from "@/hooks/use-chat";

export interface ChatActions {
  /** Whether the person may approve an action the assistant proposes. */
  canMutate?: boolean;
  onApprove?: (hash: string, preview: string) => void;
  onReject?: (hash: string) => void;
}

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

function MarkdownContent({ content }: { content: string }) {
  // Strip emojis: defense in depth in case the model ignores its instructions.
  const cleaned = content.replace(
    /[\u{1F300}-\u{1F9FF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{2300}-\u{23FF}]/gu,
    "",
  );
  return <ReactMarkdown components={MARKDOWN}>{cleaned}</ReactMarkdown>;
}

function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden>
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:0ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:150ms]" />
      <span className="size-1.5 animate-bounce rounded-full bg-current [animation-delay:300ms]" />
    </span>
  );
}

function summarizeArgs(args: Record<string, unknown>): string {
  return Object.entries(args)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(", ")
    .slice(0, 80);
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

function ToolCallList({ calls }: { calls: NonNullable<Message["toolCalls"]> }) {
  const t = useTranslations("overview.assistant");
  return (
    <ul className="space-y-1" aria-label={t("tool.label")}>
      {calls.map((call, i) => {
        const args = summarizeArgs(call.args);
        const summary = resultSummary(call.result);
        return (
          <li
            key={i}
            className="bg-background/40 text-muted-foreground flex items-start gap-1.5 rounded px-2 py-1 text-xs"
          >
            {call.result !== undefined ? (
              <CheckIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
            ) : (
              <WrenchIcon
                aria-hidden
                className="mt-0.5 size-3 shrink-0 animate-pulse"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-mono break-words">
                {call.name.replace(/_/g, " ")}
                {args && <span> ({args})</span>}
              </div>
              {summary && (
                <div className="italic">
                  {t(`tool.${summary.key}`, summary.values)}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function NavigationList({
  items,
}: {
  items: NonNullable<Message["navigation"]>;
}) {
  const { Link } = useUI();
  const t = useTranslations("overview.assistant");
  const seen = new Set<string>();
  const unique = items.filter((item) => {
    if (seen.has(item.path)) return false;
    seen.add(item.path);
    return true;
  });
  return (
    <nav
      aria-label={t("message.suggestedPages")}
      className="flex flex-wrap gap-1.5"
    >
      {unique.map((item) => (
        <Link
          key={item.path}
          href={item.path}
          className="bg-primary/15 hover:bg-primary/25 text-foreground inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors"
        >
          <ExternalLinkIcon aria-hidden className="size-3" />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}

const ACTION_TONE = {
  pending: "warn",
  approved: "info",
  completed: "ok",
  failed: "error",
  rejected: "muted",
} as const satisfies Record<PendingAction["status"], string>;

function PendingActionList({
  actions,
  canMutate = false,
  onApprove,
  onReject,
}: { actions: NonNullable<Message["pendingActions"]> } & ChatActions) {
  const t = useTranslations("overview.assistant");
  return (
    <div className="space-y-1.5">
      {actions.map((action) => (
        <div
          key={action.hash}
          className={cn(
            "bg-background/40 rounded-md border px-2.5 py-2 text-xs",
            action.status === "rejected" && "opacity-70",
          )}
        >
          <div className="flex items-start gap-1.5">
            <WrenchIcon aria-hidden className="mt-0.5 size-3 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="text-foreground font-medium">
                {t("action.confirmationRequired")}
              </div>
              <div className="text-muted-foreground break-words">
                {action.preview}
              </div>
            </div>
            {action.status !== "pending" && (
              <StatusBadge tone={ACTION_TONE[action.status]}>
                {t(`action.status.${action.status}`)}
              </StatusBadge>
            )}
          </div>
          {action.status === "pending" &&
            (canMutate && onApprove && onReject ? (
              <div className="mt-2 flex gap-1.5">
                <Button
                  size="xs"
                  onClick={() => onApprove(action.hash, action.preview)}
                >
                  {t("action.approve")}
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => onReject(action.hash)}
                >
                  {t("action.reject")}
                </Button>
              </div>
            ) : (
              <p className="text-muted-foreground mt-1.5">
                {t("action.viewer")}
              </p>
            ))}
        </div>
      ))}
    </div>
  );
}

export interface ChatMessageProps extends ChatActions {
  message: Message;
  /** This answer is still arriving. */
  isStreaming?: boolean;
}

/** One turn: the person's words, or the assistant's answer with its tool calls, proposed actions and links. */
export function ChatMessage({
  message,
  isStreaming,
  ...actions
}: ChatMessageProps) {
  const t = useTranslations("overview.assistant");
  const isUser = message.role === "user";
  const isEmpty = !message.content && !isUser;
  return (
    <div
      className={cn(
        "flex max-w-[85%] gap-2.5",
        isUser ? "ml-auto flex-row-reverse" : "mr-auto",
      )}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser ? "bg-primary/20" : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? (
          <UserIcon aria-hidden className="size-3.5" />
        ) : (
          <BotIcon aria-hidden className="size-3.5" />
        )}
      </div>
      <div
        className={cn(
          "text-foreground min-w-0 space-y-2 rounded-lg px-3 py-2 text-sm leading-relaxed break-words",
          isUser ? "bg-primary/15 whitespace-pre-wrap" : "bg-muted",
        )}
      >
        <span className="sr-only">
          {isUser ? t("message.you") : t("message.assistant")}
        </span>
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallList calls={message.toolCalls} />
        )}
        {!isUser &&
          message.pendingActions &&
          message.pendingActions.length > 0 && (
            <PendingActionList actions={message.pendingActions} {...actions} />
          )}
        {isEmpty && isStreaming ? (
          <span className="text-muted-foreground">
            <StreamingDots />
            <span className="sr-only">{t("message.thinking")}</span>
          </span>
        ) : isUser ? (
          message.content
        ) : message.content ? (
          <MarkdownContent content={message.content} />
        ) : null}
        {!isUser && message.navigation && message.navigation.length > 0 && (
          <NavigationList items={message.navigation} />
        )}
        {!isEmpty && isStreaming && (
          <span
            aria-hidden
            className="bg-foreground/60 ml-0.5 inline-block h-4 w-2 animate-pulse rounded-sm"
          />
        )}
      </div>
    </div>
  );
}

export interface MessageListProps extends ChatActions {
  messages: readonly Message[];
  isStreaming: boolean;
  className?: string;
}

/** The conversation, scrolled to its latest turn; a short welcome while it is empty. */
export function MessageList({
  messages,
  isStreaming,
  className,
  ...actions
}: MessageListProps) {
  const t = useTranslations("overview.assistant");
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-3 text-center",
          className,
        )}
      >
        <div className="bg-primary/10 flex size-12 items-center justify-center rounded-full">
          <SparklesIcon aria-hidden className="size-6" />
        </div>
        <div>
          <p className="text-foreground text-sm font-medium">Zentinelle AI</p>
          <p className="text-muted-foreground mt-1 text-xs">
            {t("message.welcome")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-label={t("message.conversation")}
      aria-busy={isStreaming || undefined}
      // Scrollable, so keyboard users can reach the history.
      tabIndex={0}
      className={cn(
        "flex-1 space-y-4 overflow-y-auto scroll-smooth outline-none",
        className,
      )}
    >
      {messages.map((message, i) => (
        <ChatMessage
          key={message.id}
          message={message}
          isStreaming={
            isStreaming &&
            message.role === "assistant" &&
            i === messages.length - 1
          }
          {...actions}
        />
      ))}
    </div>
  );
}
