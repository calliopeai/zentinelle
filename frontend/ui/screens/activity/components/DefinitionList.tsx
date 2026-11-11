import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface DefinitionItem {
  term: string;
  /** Empty values show a dash, so a missing field reads as missing rather than as blank. */
  value: React.ReactNode;
  /** Mono, for ids, hashes and addresses. */
  mono?: boolean;
}

export interface DefinitionListProps {
  items: readonly DefinitionItem[];
  /** Two columns from the `sm` breakpoint. */
  columns?: 1 | 2;
  className?: string;
}

/** Facts about one thing, term over value, in hairline rows. */
export function DefinitionList({
  items,
  columns = 2,
  className,
}: DefinitionListProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 text-sm",
        columns === 2 && "sm:grid-cols-2",
        className,
      )}
    >
      {items.map((item) => (
        <div
          key={item.term}
          className="flex min-w-0 flex-col gap-0.5 border-b border-border py-2"
        >
          <dt className="text-xs text-muted-foreground">{item.term}</dt>
          <dd
            className={cn(
              "min-w-0 break-words",
              item.mono && "font-mono text-xs",
            )}
          >
            {item.value === null ||
            item.value === undefined ||
            item.value === ""
              ? "–"
              : item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
