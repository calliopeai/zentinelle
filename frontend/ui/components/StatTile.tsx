/**
 * One headline number with its label and a line of context. Generic, and
 * missing from @calliopelabs/ui 0.1.0, so it lives here until the package
 * takes it (the Astrolift `StatTile` of the container rule).
 */
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
  /** The number, already formatted. `null` when it could not be read. */
  value: React.ReactNode | null;
  /** One line under the value: what the number is made of. */
  detail?: React.ReactNode;
  /** The whole tile links here; the label is the link. */
  href?: string;
  /** A status mark beside the detail. The detail says it in words too. */
  tone?: StatusTone;
  /** Shown instead of the value when it is `null`. */
  unavailableLabel?: string;
  loading?: boolean;
  className?: string;
}

export function StatTile({
  label,
  value,
  detail,
  href,
  tone,
  unavailableLabel = "Not available",
  loading = false,
  className,
}: StatTileProps) {
  const { Link } = useUI();
  return (
    <div
      data-slot="stat-tile"
      aria-busy={loading || undefined}
      className={cn(
        "bg-card relative min-w-0 rounded-lg border p-4",
        href && "hover:border-foreground/30",
        className,
      )}
    >
      <p className="text-muted-foreground truncate text-sm">
        {href ? (
          <Link
            href={href}
            className="focus-visible:after:ring-ring outline-none after:absolute after:inset-0 after:rounded-lg hover:underline focus-visible:after:ring-2"
          >
            {label}
          </Link>
        ) : (
          label
        )}
      </p>
      {loading ? (
        <>
          <Skeleton className="mt-2 h-7 w-20" />
          <Skeleton className="mt-2 h-3 w-32" />
        </>
      ) : (
        <>
          <p className="mt-1 truncate font-mono text-2xl font-semibold tabular-nums">
            {value ?? (
              <span className="text-muted-foreground text-base font-normal">
                {unavailableLabel}
              </span>
            )}
          </p>
          {detail && (
            <p className="text-muted-foreground mt-1 flex min-w-0 items-center gap-1.5 text-xs">
              {tone && <StatusDot tone={tone} />}
              <span className="truncate">{detail}</span>
            </p>
          )}
        </>
      )}
    </div>
  );
}
