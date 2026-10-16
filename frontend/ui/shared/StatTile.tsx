import { cn, useUI, type StatusTone } from "@calliopelabs/ui";
import type * as React from "react";

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** One line under the value: the period, the comparison, the unit. */
  hint?: React.ReactNode;
  /** A status the figure carries; the text says it too, colour never alone. */
  tone?: StatusTone;
  /** The list the figure counts. A tile that links is a real link. */
  href?: string;
  className?: string;
}

const TONE_TEXT: Record<StatusTone, string> = {
  ok: "text-success",
  warn: "text-warning",
  error: "text-danger",
  info: "text-info",
  muted: "text-muted-foreground",
};

/** A figure with its label: one tile of a KPI row. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  href,
  className,
}: StatTileProps) {
  const { Link } = useUI();
  const body = (
    <>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span
        className={cn(
          "font-mono text-2xl font-semibold tabular-nums",
          tone && TONE_TEXT[tone],
        )}
      >
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </>
  );
  const box = cn(
    "flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card p-3",
    className,
  );
  return href ? (
    <Link
      href={href}
      className={cn(
        box,
        "transition-colors hover:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
      )}
    >
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
