"use client";

import { Skeleton, cn, useUI } from "@calliopelabs/ui";
import type * as React from "react";

export interface KpiTileProps {
  label: string;
  /** The figure, already formatted. */
  value: React.ReactNode;
  /** One line under the figure: the period, the source, a comparison. */
  hint?: React.ReactNode;
  /** The tile links to where the figure comes from (KPIs that link, ui-overhaul-ia §4.1). */
  href?: string;
  /** Marks a figure the server estimated rather than measured. */
  estimated?: boolean;
  estimatedLabel?: string;
  loading?: boolean;
  className?: string;
}

/**
 * One headline figure: label, value, a line of context. Mono figures, a
 * hairline panel, no icon chips. A row of tiles sits in a grid that wraps to
 * two columns, then one, as the page narrows.
 */
export function KpiTile({
  label,
  value,
  hint,
  href,
  estimated,
  estimatedLabel = "Estimated",
  loading,
  className,
}: KpiTileProps) {
  const { Link } = useUI();
  const body = (
    <>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        {label}
        {estimated && (
          <span className="rounded-full border px-1.5 text-2xs">
            {estimatedLabel}
          </span>
        )}
      </p>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-24" />
      ) : (
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">
          {value}
        </p>
      )}
      {hint && !loading && (
        <p className="mt-1 text-xs text-muted-foreground [overflow-wrap:anywhere]">
          {hint}
        </p>
      )}
    </>
  );
  const box = cn(
    "block min-w-0 rounded-lg border bg-card px-4 py-3 text-card-foreground",
    className,
  );
  if (href) {
    return (
      <Link
        href={href}
        className={cn(
          box,
          "outline-none hover:border-ring focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {body}
      </Link>
    );
  }
  return <div className={box}>{body}</div>;
}

/** The grid a row of tiles sits in. */
export function KpiRow({
  children,
  label,
}: {
  children: React.ReactNode;
  /** Names the group for screen readers ("Usage in the last 30 days"). */
  label: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
    >
      {children}
    </div>
  );
}
