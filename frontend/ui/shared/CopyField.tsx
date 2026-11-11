"use client";

/**
 * A value to copy once (a new API key, an enrollment code): shown in full,
 * selectable, with a copy button that says when it worked. Candidate for the
 * package.
 */
import { Button, cn } from "@calliopelabs/ui";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";

export interface CopyFieldProps {
  /** Names the value for the copy button ("Copy API key"). */
  label: string;
  value: string;
  /** Defaults to the clipboard. */
  onCopy?: (value: string) => Promise<void> | void;
  copiedLabel?: string;
  className?: string;
}

export function CopyField({
  label,
  value,
  onCopy,
  copiedLabel = "Copied",
  className,
}: CopyFieldProps) {
  const [copied, setCopied] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = async () => {
    await (onCopy ?? ((v: string) => navigator.clipboard?.writeText(v)))(value);
    setCopied(true);
  };
  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-2 rounded-lg border border-input bg-muted/40 p-2",
        className,
      )}
    >
      <code className="min-w-0 flex-1 font-mono text-xs [overflow-wrap:anywhere] select-all">
        {value}
      </code>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => void copy()}
        aria-label={copied ? copiedLabel : label}
      >
        {copied ? (
          <CheckIcon aria-hidden className="size-4" />
        ) : (
          <CopyIcon aria-hidden className="size-4" />
        )}
        <span aria-live="polite">{copied ? copiedLabel : "Copy"}</span>
      </Button>
    </div>
  );
}
