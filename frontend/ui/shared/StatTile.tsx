import { cn, useUI } from "@calliopelabs/ui";
import type * as React from "react";

export interface StatTileProps {
  label: string;
  /** The figure, already formatted ("12,400", "$31.20"). */
  value: React.ReactNode;
  /** One line under the figure: the window, the comparison, "estimated". */
  hint?: React.ReactNode;
  /** The tile links to the list behind the figure. */
  href?: string;
  className?: string;
}

/**
 * One figure with its label. A KPI that links goes to the list it counts.
 * Candidate for @calliopelabs/ui (Astrolift has StatTile; the package does
 * not yet).
 */
export function StatTile({
  label,
  value,
  hint,
  href,
  className,
}: StatTileProps) {
  const { Link } = useUI();
  const body = (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-2xl font-semibold tabular-nums [overflow-wrap:anywhere]">
        {value}
      </span>
      {hint && <span className="text-muted-foreground text-xs">{hint}</span>}
    </>
  );
  const box = cn(
    "bg-card flex min-w-0 flex-col gap-1 rounded-lg border p-4",
    href &&
      "hover:border-ring focus-visible:ring-ring/50 outline-none focus-visible:ring-3",
    className,
  );
  return href ? (
    <Link href={href} className={box}>
      {body}
    </Link>
  ) : (
    <div className={box}>{body}</div>
  );
}
