import { cn } from "@calliopelabs/ui";

export interface JsonBlockProps {
  /** Names the block for screen readers ("Event payload"). */
  label: string;
  value: unknown;
  className?: string;
}

/** A payload as indented JSON, wrapping long strings instead of scrolling a page sideways. */
export function JsonBlock({ label, value, className }: JsonBlockProps) {
  if (value === null || value === undefined)
    return (
      <p className="text-sm text-muted-foreground">No {label.toLowerCase()}.</p>
    );
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={cn(
        "max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs break-words whitespace-pre-wrap",
        className,
      )}
    >
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
