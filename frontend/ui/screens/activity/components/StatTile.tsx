import { StatusDot, cn, type StatusTone } from "@calliopelabs/ui";
import type * as React from "react";

export interface StatTileProps {
  label: string;
  value: React.ReactNode;
  /** One line under the value: the target, the change, the unit. */
  hint?: React.ReactNode;
  /** A status dot beside the label, when the figure is good or bad. */
  tone?: StatusTone;
  className?: string;
}

/** One figure with its label, in a row of tiles. */
export function StatTile({
  label,
  value,
  hint,
  tone,
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1 rounded-lg border border-border bg-card px-3 py-2.5",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {tone && <StatusDot tone={tone} />}
        {label}
      </span>
      <span className="font-mono text-lg font-medium tabular-nums">
        {value}
      </span>
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </div>
  );
}
