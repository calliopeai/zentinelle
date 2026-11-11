import { cn } from "@calliopelabs/ui";

export interface CodeBlockProps {
  /** Text, or a value shown as indented JSON. */
  value: unknown;
  /** Names the block for screen readers ("Policy configuration"). */
  label: string;
  /** Caps the height; the block scrolls inside. */
  maxHeight?: "sm" | "md" | "none";
  className?: string;
}

const HEIGHT = { sm: "max-h-40", md: "max-h-80", none: "" } as const;

function format(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** Read-only code or JSON, in mono, wrapped so a long line never widens the page. */
export function CodeBlock({
  value,
  label,
  maxHeight = "md",
  className,
}: CodeBlockProps) {
  return (
    <pre
      aria-label={label}
      tabIndex={0}
      className={cn(
        "overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap [overflow-wrap:anywhere] focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        HEIGHT[maxHeight],
        className,
      )}
    >
      {format(value)}
    </pre>
  );
}
