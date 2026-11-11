import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface Definition {
  term: string;
  /** `null` or `undefined` draws "Not set", so an empty field reads as empty. */
  description: React.ReactNode | null | undefined;
}

export interface DefinitionListProps {
  items: readonly Definition[];
  /** Two columns of pairs on a wide page. */
  columns?: 1 | 2;
  emptyLabel?: string;
  className?: string;
}

/**
 * The facts of an entity as term and value pairs, in hairline rows. A
 * candidate for @calliopelabs/ui (Astrolift's DefinitionList).
 */
export function DefinitionList({
  items,
  columns = 1,
  emptyLabel = "Not set",
  className,
}: DefinitionListProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-8 text-sm",
        columns === 2 && "md:grid-cols-2",
        className,
      )}
    >
      {items.map(({ term, description }) => (
        <div
          key={term}
          className="flex min-w-0 flex-col gap-0.5 border-b py-2 sm:flex-row sm:gap-4"
        >
          <dt className="shrink-0 text-muted-foreground sm:w-40">{term}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {description ?? (
              <span className="text-muted-foreground">{emptyLabel}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
