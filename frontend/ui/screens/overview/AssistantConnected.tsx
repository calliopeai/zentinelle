"use client";

import { useAvailableModels, useChat } from "@/hooks/use-chat";

import { AssistantScreen } from "./AssistantScreen";

/** The assistant page on the app's chat hook: what `app/(app)/assistant/page.tsx` renders. */
export function AssistantConnected({ canMutate }: { canMutate: boolean }) {
  const chat = useChat();
  const { models, loading } = useAvailableModels({ requireTools: true });
  return (
    <AssistantScreen
      messages={chat.messages}
      isStreaming={chat.isStreaming}
      error={chat.error}
      models={models}
      modelsLoading={loading}
      model={chat.model}
      onModelChange={chat.setModel}
      onSend={(content) => void chat.sendMessage(content)}
      onStop={chat.stopStreaming}
      onClear={chat.clearChat}
      canMutate={canMutate}
      onApprove={(hash, preview) => void chat.approveAction(hash, preview)}
      onReject={chat.rejectAction}
    />
  );
}
