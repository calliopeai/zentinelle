"use client";

import { Button, PageFrame, StatusBadge } from "@calliopelabs/ui";
import { Trash2Icon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ChatModel, Message } from "@/hooks/use-chat";

import { ChatInput } from "./components/ChatInput";
import { MessageList } from "./components/MessageList";
import { ModelSelector } from "./components/ModelSelector";

export interface AssistantScreenProps {
  messages: readonly Message[];
  /** An answer is arriving. */
  isStreaming: boolean;
  /** The last request failed; the message says why. */
  error?: string | null;
  models: readonly ChatModel[];
  modelsLoading?: boolean;
  model: string;
  onModelChange: (model: string) => void;
  onSend: (content: string) => void;
  onStop: () => void;
  onClear: () => void;
  /** Operators and admins approve what the assistant proposes; viewers only read. */
  canMutate: boolean;
  onApprove: (hash: string, preview: string) => void;
  onReject: (hash: string) => void;
}

/**
 * The assistant on a page of its own (`/assistant`, reached from the
 * Overview): the same conversation as the chat bubble, with room to read.
 * Pure: `AssistantConnected` holds the conversation (`useChat`).
 */
export function AssistantScreen({
  messages,
  isStreaming,
  error,
  models,
  modelsLoading,
  model,
  onModelChange,
  onSend,
  onStop,
  onClear,
  canMutate,
  onApprove,
  onReject,
}: AssistantScreenProps) {
  const t = useTranslations("overview.assistant");
  const selected = models.find((m) => m.value === model);
  return (
    <PageFrame
      title={t("screen.title")}
      context={
        selected && (
          <span className="inline-flex items-center gap-1.5">
            {selected.label}
            <StatusBadge tone="muted">{selected.provider}</StatusBadge>
          </span>
        )
      }
      description={t("screen.description")}
      primaryAction={
        messages.length > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onClear}
            disabled={isStreaming}
          >
            <Trash2Icon aria-hidden />
            {t("screen.clear")}
          </Button>
        )
      }
    >
      <div className="bg-card flex h-[calc(100dvh-16rem)] min-h-96 flex-col rounded-lg border">
        <div className="flex items-center justify-end border-b px-4 py-2">
          <ModelSelector
            models={models}
            loading={modelsLoading}
            value={model}
            onValueChange={onModelChange}
          />
        </div>
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          className="px-4 py-6 lg:px-12"
          canMutate={canMutate}
          onApprove={onApprove}
          onReject={onReject}
        />
        {error && (
          <p
            role="alert"
            className="bg-destructive/10 text-destructive mx-4 mb-2 rounded-md px-3 py-2 text-sm lg:mx-12"
          >
            {error}
          </p>
        )}
        <div className="border-t px-4 py-3 lg:px-12">
          <ChatInput
            onSend={onSend}
            isStreaming={isStreaming}
            onStop={onStop}
          />
          <p className="text-muted-foreground mt-2 text-xs" aria-live="polite">
            {isStreaming ? t("input.generating") : t("input.hint")}
          </p>
        </div>
      </div>
    </PageFrame>
  );
}
