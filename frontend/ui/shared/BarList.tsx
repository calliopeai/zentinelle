"use client";

import { cn, useUI } from "@calliopelabs/ui";

export interface BarListItem {
  key: string;
  label: string;
  value: number;
  /** The value as the reader sees it ("$41.20", "842 ms"). */
  display: string;
  href?: string;
}

export interface BarListProps {
  /** Names the list for screen readers. */
  label: string;
  items: readonly BarListItem[];
  emptyLabel: string;
  className?: string;
}

/**
 * A ranked top-N: name, a bar scaled to the largest value, the figure. For a
 * server aggregate's few rows (top agents by cost, slowest endpoints), never
 * for a list that can grow: that is a DataTable.
 */
export function BarList({ label, items, emptyLabel, className }: BarListProps) {
  const { Link } = useUI();
  const max = Math.max(0, ...items.map((i) => i.value));
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
        {emptyLabel}
      </p>
    );
  }
  return (
    <ol aria-label={label} className={cn("flex flex-col gap-2", className)}>
      {items.map((item) => (
        <li key={item.key} className="flex min-w-0 flex-col gap-1">
          <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
            {item.href ? (
              <Link
                href={item.href}
                className="min-w-0 truncate hover:underline"
                title={item.label}
              >
                {item.label}
              </Link>
            ) : (
              <span className="min-w-0 truncate" title={item.label}>
                {item.label}
              </span>
            )}
            <span className="shrink-0 font-mono text-xs tabular-nums">
              {item.display}
            </span>
          </div>
          <div aria-hidden className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-chart-1"
              style={{ width: `${max > 0 ? (item.value / max) * 100 : 0}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
