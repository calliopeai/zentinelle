import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface Definition {
  term: string;
  /** Empty values are left out, unless `fallback` names them. */
  value: React.ReactNode;
  /** Technical values (ids, digests, slugs) set in mono. */
  mono?: boolean;
}

export interface DefinitionListProps {
  items: readonly Definition[];
  /** Shown for an empty value; without it the row is dropped. */
  fallback?: string;
  /** Columns at the widest breakpoint. */
  columns?: 1 | 2 | 3;
  className?: string;
}

const COLUMNS = {
  1: "",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
} as const;

function isEmpty(value: React.ReactNode) {
  return value === null || value === undefined || value === "";
}

/**
 * Term and value pairs, wrapping long values instead of overflowing.
 * Candidate for @calliopelabs/ui (Astrolift's DefinitionList).
 */
export function DefinitionList({
  items,
  fallback,
  columns = 2,
  className,
}: DefinitionListProps) {
  const shown = items.filter((item) => fallback || !isEmpty(item.value));
  return (
    <dl className={cn("grid min-w-0 gap-3", COLUMNS[columns], className)}>
      {shown.map((item) => (
        <div key={item.term} className="min-w-0">
          <dt className="text-muted-foreground text-xs">{item.term}</dt>
          <dd
            className={cn(
              "text-sm [overflow-wrap:anywhere]",
              item.mono && "font-mono text-xs",
              isEmpty(item.value) && "text-muted-foreground",
            )}
          >
            {isEmpty(item.value) ? fallback : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
