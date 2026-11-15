"use client";

import { useCapability } from "@/components/PermissionGuard";

import { useTranslations } from "next-intl";
import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SparklesIcon, XIcon, Trash2Icon, LoaderIcon } from "lucide-react";
import { useChat, useAvailableModels } from "@/hooks/use-chat";
import { cn } from "@/lib/utils";
import { ChatInput } from "@/ui/screens/overview/components/ChatInput";
import { MessageList } from "@/ui/screens/overview/components/MessageList";
import { ModelSelector } from "@/ui/screens/overview/components/ModelSelector";

/* Inside the sheet, so the models load when someone opens the assistant. */
function BubbleModelSelector(props: {
  value: string;
  onValueChange: (value: string) => void;
}) {
  const { models, loading } = useAvailableModels({ requireTools: true });
  return (
    <ModelSelector
      models={models}
      loading={loading}
      className="h-7 max-w-40 text-xs"
      {...props}
    />
  );
}

/* ── Floating chat bubble ────────────────────────────────────────── */
export function ChatBubble() {
  const t = useTranslations("overview.assistant");
  const [open, setOpen] = React.useState(false);
  const canMutate = useCapability("mutate");
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
        data-tour="ai-assistant-bubble"
        aria-label={t("bubble.open")}
        className={cn(
          "fixed bottom-6 right-6 z-40 flex size-12 items-center justify-center rounded-full shadow-lg transition-all hover:scale-105 active:scale-95",
          "bg-[#37efed] text-black",
          !open && "animate-pulse-subtle",
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
              <SheetTitle className="text-sm font-semibold">
                Zentinelle AI
              </SheetTitle>
            </div>
            <SheetDescription className="sr-only">
              {t("bubble.description")}
            </SheetDescription>
            <div className="flex items-center gap-1">
              <BubbleModelSelector value={model} onValueChange={setModel} />
              {messages.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={clearChat}
                  aria-label={t("screen.clear")}
                >
                  <Trash2Icon className="size-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setOpen(false)}
                aria-label={t("bubble.close")}
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
            canMutate={canMutate}
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
                  {t("input.generating")}
                </span>
              ) : (
                t("input.hintCompact")
              )}
            </p>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
