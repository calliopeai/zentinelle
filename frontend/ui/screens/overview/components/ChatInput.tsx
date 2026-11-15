"use client";

import { Button, Textarea } from "@calliopelabs/ui";
import { SendIcon, SquareIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import * as React from "react";

export interface ChatInputProps {
  onSend: (content: string) => void;
  isStreaming: boolean;
  onStop: () => void;
  /** Cmd+Enter (Ctrl+Enter) sends; without `compact`, plain Enter does too. */
  compact?: boolean;
}

/** The message box: send while idle, stop while an answer is arriving. */
export function ChatInput({
  onSend,
  isStreaming,
  onStop,
  compact,
}: ChatInputProps) {
  const t = useTranslations("overview.assistant.input");
  const [value, setValue] = React.useState("");

  const send = () => {
    if (!value.trim() || isStreaming) return;
    onSend(value);
    setValue("");
  };

  return (
    <div className="flex items-end gap-2">
      <Textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          const modified = event.metaKey || event.ctrlKey;
          if (modified || (!compact && !event.shiftKey)) {
            event.preventDefault();
            send();
          }
        }}
        aria-label={t("label")}
        placeholder={t("placeholder")}
        rows={1}
        className="max-h-32 min-h-10 resize-none"
      />
      {isStreaming ? (
        <Button
          variant="outline"
          size="icon"
          onClick={onStop}
          aria-label={t("stop")}
          className="shrink-0"
        >
          <SquareIcon aria-hidden />
        </Button>
      ) : (
        <Button
          size="icon"
          onClick={send}
          disabled={!value.trim()}
          aria-label={t("send")}
          className="shrink-0"
        >
          <SendIcon aria-hidden />
        </Button>
      )}
    </div>
  );
}
