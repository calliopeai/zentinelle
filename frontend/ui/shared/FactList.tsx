import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface Fact {
  term: string;
  value: React.ReactNode;
  /** Mono for ids, figures and prices. */
  mono?: boolean;
}

export interface FactListProps {
  items: readonly Fact[];
  /** Two columns on a wide panel; one by default. */
  columns?: 1 | 2;
  className?: string;
}

/** Facts about one thing, term beside value: a model's prices, a run's evidence. */
export function FactList({ items, columns = 1, className }: FactListProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-2 text-sm",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.term}
          className="flex min-w-0 items-baseline justify-between gap-4 border-b border-border/60 pb-2"
        >
          <dt className="shrink-0 text-muted-foreground">{item.term}</dt>
          <dd
            className={cn(
              "min-w-0 text-right [overflow-wrap:anywhere]",
              item.mono && "font-mono text-xs tabular-nums",
            )}
          >
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
