import {
  Skeleton,
  StatusDot,
  cn,
  useUI,
  type StatusTone,
} from "@calliopelabs/ui";
import type * as React from "react";

export interface StatTileProps {
  label: string;
  /** The figure. `null` draws a dash: the server did not say. */
  value: React.ReactNode | null;
  /** One line under the figure: a unit, a comparison, a scope. */
  hint?: React.ReactNode;
  /** A status beside the label; colour is never the only carrier, so the hint says why. */
  tone?: StatusTone;
  /** The list the figure counts. A tile that links is a real link. */
  href?: string;
  loading?: boolean;
  className?: string;
}

/**
 * One figure with its label: the top row of an overview. Figures come from
 * the server's aggregates, never from counting a fetched list. A candidate
 * for @calliopelabs/ui (Astrolift has StatTile; the package does not yet).
 */
export function StatTile({
  label,
  value,
  hint,
  tone,
  href,
  loading = false,
  className,
}: StatTileProps) {
  const { Link } = useUI();
  const figure = loading ? (
    <Skeleton className="h-7 w-16" />
  ) : (
    <span className="font-mono text-2xl font-semibold tabular-nums">
      {value ?? "-"}
    </span>
  );
  return (
    <div
      data-slot="stat-tile"
      aria-busy={loading || undefined}
      className={cn(
        "relative flex min-w-0 flex-col gap-1 rounded-lg border bg-card p-4",
        href && "transition-colors hover:border-ring",
        className,
      )}
    >
      <span className="flex items-center gap-2 text-sm text-muted-foreground">
        {tone && <StatusDot tone={tone} />}
        {href ? (
          <Link
            href={href}
            className="truncate outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {label}
          </Link>
        ) : (
          <span className="truncate">{label}</span>
        )}
      </span>
      {figure}
      {hint && (
        <span className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {hint}
        </span>
      )}
    </div>
  );
}

/** Tiles in a row that wraps: four across on a wide page, two on a narrow one. */
export function StatGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{children}</div>
  );
}
