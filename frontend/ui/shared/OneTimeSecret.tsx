import { Button } from "@calliopelabs/ui";
import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";

export interface OneTimeSecretProps {
  /** Names the secret ("API key for support-bot"). */
  label: string;
  value: string;
  /** Defaults to the clipboard. Stories and tests pass their own. */
  onCopy?: (value: string) => Promise<void> | void;
}

/**
 * A secret shown once (an API key at creation), with a copy button that
 * says when it worked. Candidate for @calliopelabs/ui: Astrolift and
 * Zentinelle AI both reveal keys this way.
 */
export function OneTimeSecret({ label, value, onCopy }: OneTimeSecretProps) {
  const [copied, setCopied] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);
  async function copy() {
    try {
      await (onCopy ?? ((v: string) => navigator.clipboard.writeText(v)))(
        value,
      );
      setFailed(false);
      setCopied(true);
    } catch {
      setFailed(true);
    }
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="bg-muted flex min-w-0 items-center gap-2 rounded-lg border p-3">
        <code
          aria-label={label}
          className="min-w-0 flex-1 font-mono text-sm break-all"
        >
          {value}
        </code>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => void copy()}
          aria-label={copied ? "Copied" : `Copy ${label}`}
        >
          {copied ? <CheckIcon aria-hidden /> : <CopyIcon aria-hidden />}
        </Button>
      </div>
      <p role="status" className="text-muted-foreground text-xs">
        {failed
          ? "Copy failed. Select the key and copy it by hand."
          : copied
            ? "Copied to the clipboard."
            : ""}
      </p>
    </div>
  );
}
