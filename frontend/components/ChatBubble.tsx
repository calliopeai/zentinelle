"use client";

import * as React from "react";
import { useRef, useEffect } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  SparklesIcon,
  SendIcon,
  XIcon,
  Trash2Icon,
  BotIcon,
  UserIcon,
  SquareIcon,
  LoaderIcon,
  WrenchIcon,
  ExternalLinkIcon,
  CheckIcon,
} from "lucide-react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import { useChat, useAvailableModels, MODELS, type Message, type ChatModel } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";

/* ── Provider color mapping ──────────────────────────────────────── */
function providerColor(provider: string): string {
  switch (provider) {
    case "Anthropic":
      return "bg-amber-500/15 text-amber-400 dark:bg-amber-500/15 dark:text-amber-400";
    case "OpenAI":
      return "bg-emerald-500/15 text-emerald-400 dark:bg-emerald-500/15 dark:text-emerald-400";
    case "Google":
      return "bg-blue-500/15 text-blue-400 dark:bg-blue-500/15 dark:text-blue-400";
    case "DeepSeek":
      return "bg-violet-500/15 text-violet-400 dark:bg-violet-500/15 dark:text-violet-400";
    case "Together/Groq":
      return "bg-rose-500/15 text-rose-400 dark:bg-rose-500/15 dark:text-rose-400";
    default:
      return "bg-muted text-muted-foreground";
  }
}

/* ── Group models by provider for the select ─────────────────────── */
function groupByProvider(models: ChatModel[]): Record<string, ChatModel[]> {
  return models.reduce<Record<string, ChatModel[]>>((acc, m) => {
    (acc[m.provider] ??= []).push(m);
    return acc;
  }, {});
}

/* ── Model selector (reused in bubble + full page) ───────────────── */
function ModelSelector({
  value,
  onValueChange,
  className,
}: {
  value: string;
  onValueChange: (v: string) => void;
  className?: string;
}) {
  const { models, loading } = useAvailableModels();
  const modelsByProvider = groupByProvider(models);
  const selected = models.find((m) => m.value === value);

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className={cn("h-7 text-xs", className)}>
        <SelectValue>
          {loading ? "Loading models…" : selected ? selected.label : "Select model"}
        </SelectValue>
      </SelectTrigger>
      <SelectContent className="max-h-[400px]">
        {models.length === 0 && !loading && (
          <div className="px-3 py-2 text-xs text-muted-foreground">
            No providers configured. Add API keys in Settings → LLM Providers.
          </div>
        )}
        {Object.entries(modelsByProvider).map(([provider, providerModels]) => (
          <SelectGroup key={provider}>
            <SelectLabel className="flex items-center justify-between">
              <span>{provider}</span>
              <span className="text-[9px] text-muted-foreground">
                {providerModels.length} model{providerModels.length !== 1 ? "s" : ""}
              </span>
            </SelectLabel>
            {providerModels.map((m) => (
              <SelectItem key={m.value} value={m.value}>
                <div className="flex items-center justify-between gap-2 w-full">
                  <span className="flex items-center gap-1.5">
                    {m.label}
                    {m.supportsTools && (
                      <span
                        title="Function calling"
                        className="text-[9px] text-emerald-500 font-mono px-1 border border-emerald-500/30 rounded"
                      >
                        tools
                      </span>
                    )}
                    {m.supportsVision && (
                      <span
                        title="Vision"
                        className="text-[9px] text-blue-500 font-mono px-1 border border-blue-500/30 rounded"
                      >
                        vis
                      </span>
                    )}
                  </span>
                  {m.releaseDate && (
                    <span className="text-[9px] text-muted-foreground tabular-nums">
                      {m.releaseDate.slice(0, 7)}
                    </span>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}

/* ── Streaming indicator ─────────────────────────────────────────── */
function StreamingDots() {
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:0ms]" />
      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:150ms]" />
      <span className="size-1.5 rounded-full bg-current animate-bounce [animation-delay:300ms]" />
    </span>
  );
}

/* ── Single message row ──────────────────────────────────────────── */
function MarkdownContent({ content }: { content: string }) {
  // Strip emojis (Unicode emoji ranges) — defense in depth in case the LLM ignores instructions
  const cleaned = content.replace(
    /[\u{1F300}-\u{1F9FF}\u{1F000}-\u{1F2FF}\u{2600}-\u{27BF}\u{1FA00}-\u{1FAFF}\u{2300}-\u{23FF}]/gu,
    "",
  );
  const Markdown = ReactMarkdown as React.ComponentType<{
    children: string;
    components?: Record<string, React.FC<any>>;
  }>;

  return (
    <Markdown
      components={{
        p: ({ children }: any) => <p className="mb-1.5 last:mb-0">{children}</p>,
        ul: ({ children }: any) => (
          <ul className="my-1.5 space-y-0.5 list-disc pl-4">{children}</ul>
        ),
        ol: ({ children }: any) => (
          <ol className="my-1.5 space-y-0.5 list-decimal pl-4">{children}</ol>
        ),
        li: ({ children }: any) => <li className="leading-snug">{children}</li>,
        strong: ({ children }: any) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }: any) => <em className="italic">{children}</em>,
        code: ({ children }: any) => (
          <code className="bg-background/60 rounded px-1 py-0.5 font-mono text-[12px]">
            {children}
          </code>
        ),
        pre: ({ children }: any) => (
          <pre className="bg-background/80 rounded p-2 my-1.5 overflow-x-auto text-[12px]">
            {children}
          </pre>
        ),
        h1: ({ children }: any) => <h1 className="font-semibold mt-2 mb-1">{children}</h1>,
        h2: ({ children }: any) => <h2 className="font-semibold mt-2 mb-1">{children}</h2>,
        h3: ({ children }: any) => <h3 className="font-semibold mt-2 mb-1">{children}</h3>,
        a: ({ children, href }: any) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary underline underline-offset-2"
          >
            {children}
          </a>
        ),
      }}
    >
      {cleaned}
    </Markdown>
  );
}

function humanizeToolName(name: string): string {
  return name.replace(/_/g, " ");
}

function summarizeArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args).filter(([, v]) => v !== undefined && v !== null && v !== "");
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
    .join(", ")
    .slice(0, 80);
}

function summarizeResult(result: unknown): string {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, unknown>;
  if (r.error) return `error: ${String(r.error).slice(0, 60)}`;
  if (r.success) return "done";
  if (typeof r.count === "number") return `${r.count} result${r.count === 1 ? "" : "s"}`;
  if (typeof r.missing_count === "number") return `${r.missing_count} gaps`;
  return "";
}

function ToolCallList({ calls }: { calls: NonNullable<Message["toolCalls"]> }) {
  return (
    <div className="space-y-1">
      {calls.map((c, i) => {
        const argSummary = summarizeArgs(c.args);
        const resultSummary = summarizeResult(c.result);
        const hasResult = c.result !== undefined;
        return (
          <div
            key={i}
            className="flex items-start gap-1.5 text-[11px] text-muted-foreground bg-background/40 rounded px-2 py-1"
          >
            {hasResult ? (
              <CheckIcon className="size-3 shrink-0 mt-0.5 text-emerald-500" />
            ) : (
              <WrenchIcon className="size-3 shrink-0 mt-0.5 animate-pulse" />
            )}
            <div className="flex-1 min-w-0">
              <div className="font-mono">
                {humanizeToolName(c.name)}
                {argSummary && <span className="opacity-70"> ({argSummary})</span>}
              </div>
              {resultSummary && (
                <div className="opacity-70 italic">{resultSummary}</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function NavigationList({ items }: { items: NonNullable<Message["navigation"]> }) {
  // Dedupe by path
  const seen = new Set<string>();
  const unique = items.filter((i) => {
    if (seen.has(i.path)) return false;
    seen.add(i.path);
    return true;
  });
  return (
    <div className="flex flex-wrap gap-1.5 pt-1">
      {unique.map((item, i) => (
        <Link
          key={i}
          href={item.path}
          className="inline-flex items-center gap-1 rounded-md bg-primary/15 hover:bg-primary/25 px-2 py-1 text-[11px] text-primary transition-colors"
        >
          <ExternalLinkIcon className="size-3" />
          <span>{item.label}</span>
        </Link>
      ))}
    </div>
  );
}

function PendingActionList({
  actions,
  onApprove,
  onReject,
}: {
  actions: NonNullable<Message["pendingActions"]>;
  onApprove: (hash: string, preview: string) => void;
  onReject: (hash: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {actions.map((a) => {
        const isPending = a.status === "pending";
        const isApproved = a.status === "approved";
        const isRejected = a.status === "rejected";
        return (
          <div
            key={a.hash}
            className={cn(
              "rounded-md border px-2.5 py-2 text-[11px]",
              isPending && "border-amber-500/40 bg-amber-500/5",
              isApproved && "border-emerald-500/40 bg-emerald-500/5",
              isRejected && "border-muted-foreground/30 bg-muted/40 opacity-70"
            )}
          >
            <div className="flex items-start gap-1.5">
              <WrenchIcon className="size-3 shrink-0 mt-0.5 opacity-70" />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-foreground">Confirmation required</div>
                <div className="text-muted-foreground break-words">{a.preview}</div>
              </div>
            </div>
            {isPending && (
              <div className="flex gap-1.5 mt-2">
                <Button
                  size="sm"
                  className="h-6 text-[11px] px-2"
                  onClick={() => onApprove(a.hash, a.preview)}
                >
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-6 text-[11px] px-2"
                  onClick={() => onReject(a.hash)}
                >
                  Cancel
                </Button>
              </div>
            )}
            {isApproved && (
              <div className="mt-1.5 text-[10px] text-emerald-500">Approved — running…</div>
            )}
            {isRejected && (
              <div className="mt-1.5 text-[10px] text-muted-foreground">Cancelled</div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ChatMessage({
  message,
  isStreaming,
  onApprove,
  onReject,
}: {
  message: Message;
  isStreaming?: boolean;
  onApprove?: (hash: string, preview: string) => void;
  onReject?: (hash: string) => void;
}) {
  const isUser = message.role === "user";
  const isEmpty = !message.content && !isUser;

  return (
    <div
      className={cn(
        "flex gap-2.5 max-w-[85%]",
        isUser ? "ml-auto flex-row-reverse" : "mr-auto"
      )}
    >
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary/20 text-primary"
            : "bg-muted text-muted-foreground"
        )}
      >
        {isUser ? <UserIcon className="size-3.5" /> : <BotIcon className="size-3.5" />}
      </div>
      <div
        className={cn(
          "rounded-lg px-3 py-2 text-sm leading-relaxed break-words space-y-2",
          isUser
            ? "bg-primary/15 text-foreground whitespace-pre-wrap"
            : "bg-muted text-foreground"
        )}
      >
        {!isUser && message.toolCalls && message.toolCalls.length > 0 && (
          <ToolCallList calls={message.toolCalls} />
        )}
        {!isUser &&
          message.pendingActions &&
          message.pendingActions.length > 0 &&
          onApprove &&
          onReject && (
            <PendingActionList
              actions={message.pendingActions}
              onApprove={onApprove}
              onReject={onReject}
            />
          )}
        {isEmpty && isStreaming ? (
          <span className="text-muted-foreground">
            <StreamingDots />
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
          <span className="inline-block ml-0.5 text-muted-foreground">
            <span className="inline-block w-2 h-4 bg-foreground/60 animate-pulse rounded-sm" />
          </span>
        )}
      </div>
    </div>
  );
}

/* ── Chat input bar ──────────────────────────────────────────────── */
function ChatInput({
  onSend,
  isStreaming,
  onStop,
  compact,
}: {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  compact?: boolean;
}) {
  const [value, setValue] = React.useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue("");
    // Reset textarea height
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
    // Plain Enter without shift also sends in compact mode
    if (!compact && e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex items-end gap-2">
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask Zentinelle AI..."
        className={cn(
          "min-h-10 max-h-32 resize-none",
          compact ? "text-sm" : "text-sm"
        )}
        rows={1}
      />
      {isStreaming ? (
        <Button
          variant="outline"
          size="icon"
          onClick={onStop}
          aria-label="Stop generating"
          className="shrink-0"
        >
          <SquareIcon className="size-4" />
        </Button>
      ) : (
        <Button
          size="icon"
          onClick={handleSend}
          disabled={!value.trim()}
          aria-label="Send message"
          className="shrink-0"
        >
          <SendIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}

/* ── Messages list (scrollable) ──────────────────────────────────── */
function MessageList({
  messages,
  isStreaming,
  className,
  onApprove,
  onReject,
}: {
  messages: Message[];
  isStreaming: boolean;
  className?: string;
  onApprove?: (hash: string, preview: string) => void;
  onReject?: (hash: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages, isStreaming]);

  if (messages.length === 0) {
    return (
      <div className={cn("flex flex-1 flex-col items-center justify-center gap-3 text-center", className)}>
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <SparklesIcon className="size-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">Zentinelle AI</p>
          <p className="text-xs text-muted-foreground mt-1">
            Ask about your agents, policies, compliance, or anything else.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={scrollRef}
      className={cn(
        "flex-1 overflow-y-auto space-y-4 scroll-smooth",
        className
      )}
    >
      {messages.map((msg, i) => (
        <ChatMessage
          key={msg.id}
          message={msg}
          isStreaming={
            isStreaming &&
            msg.role === "assistant" &&
            i === messages.length - 1
          }
          onApprove={onApprove}
          onReject={onReject}
        />
      ))}
    </div>
  );
}

/* ── Floating chat bubble ────────────────────────────────────────── */
export function ChatBubble() {
  const [open, setOpen] = React.useState(false);
  const {
    messages,
    isStreaming,
    model,
    setModel,
    sendMessage,
    clearChat,
    stopStreaming,
    error,
    approveAction,
    rejectAction,
  } = useChat();

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Open AI assistant"
        className={cn(
          "fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
          "bg-[#37efed] text-black",
          !open && "animate-pulse-subtle"
        )}
      >
        <SparklesIcon className="size-5" />
      </button>

      {/* Sheet panel */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          showCloseButton={false}
          className="flex w-full flex-col p-0 sm:max-w-[400px]"
        >
          {/* Header */}
          <SheetHeader className="flex-row items-center justify-between gap-2 border-b px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex size-7 items-center justify-center rounded-full bg-[#37efed]/15">
                <SparklesIcon className="size-3.5 text-[#37efed]" />
              </div>
              <SheetTitle className="text-sm font-semibold">Zentinelle AI</SheetTitle>
            </div>
            <SheetDescription className="sr-only">
              AI assistant for Zentinelle GRC platform
            </SheetDescription>
            <div className="flex items-center gap-1">
              <ModelSelector value={model} onValueChange={setModel} />
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearChat}
                  aria-label="Clear chat"
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label="Close assistant"
              >
                <XIcon className="size-3.5" />
              </Button>
            </div>
          </SheetHeader>

          {/* Messages */}
          <MessageList
            messages={messages}
            isStreaming={isStreaming}
            className="px-4 py-4"
            onApprove={approveAction}
            onReject={rejectAction}
          />

          {/* Error */}
          {error && (
            <div className="mx-4 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              {error}
            </div>
          )}

          {/* Input */}
          <div className="border-t px-4 py-3">
            <ChatInput
              onSend={sendMessage}
              isStreaming={isStreaming}
              onStop={stopStreaming}
              compact
            />
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {isStreaming ? (
                <span className="flex items-center gap-1">
                  <LoaderIcon className="size-3 animate-spin" />
                  Generating...
                </span>
              ) : (
                "Cmd+Enter to send"
              )}
            </p>
          </div>
        </SheetContent>
      </Sheet>

    </>
  );
}

/* ── Exports for the full-page assistant view ────────────────────── */
export {
  ModelSelector,
  ChatInput,
  MessageList,
  ChatMessage,
  StreamingDots,
  providerColor,
};
