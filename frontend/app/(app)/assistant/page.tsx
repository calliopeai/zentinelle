"use client";

import { useChat, MODELS } from "@/hooks/use-chat";
import {
  ModelSelector,
  ChatInput,
  MessageList,
  providerColor,
} from "@/components/ChatBubble";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  SparklesIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function AssistantPage() {
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

  const selectedModel = MODELS.find((m) => m.value === model);

  return (
    <div className="flex h-[calc(100vh-4rem)] overflow-hidden">
      {/* Left sidebar -- conversation history */}
      <aside className="hidden w-64 shrink-0 flex-col border-r lg:flex">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <h2 className="text-sm font-semibold text-foreground">Conversations</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-sm"
            onClick={clearChat}
          >
            <PlusIcon className="size-4" />
            New Chat
          </Button>
          {/* Future: conversation history list goes here */}
        </div>
      </aside>

      {/* Main chat area */}
      <div className="flex flex-1 flex-col">
        {/* Header bar */}
        <div className="flex items-center justify-between border-b px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex size-8 items-center justify-center rounded-full bg-[#37efed]/15">
              <SparklesIcon className="size-4 text-[#37efed]" />
            </div>
            <div>
              <h1 className="text-sm font-semibold text-foreground">Zentinelle AI</h1>
              {selectedModel && (
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-xs text-muted-foreground">{selectedModel.label}</span>
                  <Badge
                    variant="secondary"
                    className={cn(
                      "text-[10px] px-1.5 py-0 h-4",
                      providerColor(selectedModel.provider)
                    )}
                  >
                    {selectedModel.provider}
                  </Badge>
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ModelSelector value={model} onValueChange={setModel} />
            {messages.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={clearChat}
                className="gap-1.5"
              >
                <Trash2Icon className="size-3.5" />
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Messages */}
        <MessageList
          messages={messages}
          isStreaming={isStreaming}
          className="px-6 py-6 lg:px-16 xl:px-24"
        />

        {/* Error */}
        {error && (
          <div className="mx-6 mb-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive lg:mx-16 xl:mx-24">
            {error}
          </div>
        )}

        {/* Input */}
        <div className="border-t px-6 py-4 lg:px-16 xl:px-24">
          <ChatInput
            onSend={sendMessage}
            isStreaming={isStreaming}
            onStop={stopStreaming}
          />
          <p className="mt-2 text-xs text-muted-foreground">
            {isStreaming
              ? "Generating response..."
              : "Cmd+Enter or Enter to send. Shift+Enter for new line."}
          </p>
        </div>
      </div>
    </div>
  );
}
