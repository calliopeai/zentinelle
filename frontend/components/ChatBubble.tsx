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
} from "lucide-react";
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
                      <span title="Function calling" className="text-[9px] text-emerald-500 font-mono">
                        🔧
                      </span>
                    )}
                    {m.supportsVision && (
                      <span title="Vision" className="text-[9px] text-blue-500 font-mono">
                        👁
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
function ChatMessage({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
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
          "rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words",
          isUser
            ? "bg-primary/15 text-foreground"
            : "bg-muted text-foreground"
        )}
      >
        {isEmpty && isStreaming ? (
          <span className="text-muted-foreground">
            <StreamingDots />
          </span>
        ) : (
          message.content
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
}: {
  messages: Message[];
  isStreaming: boolean;
  className?: string;
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
