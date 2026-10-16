/**
 * Read-only facts about a thing, as term and value pairs (Astrolift's
 * DefinitionList). Long values wrap anywhere instead of widening the page.
 * Candidate for the package.
 */
import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface Definition {
  term: string;
  value: React.ReactNode;
  /** Monospace, for ids, prefixes and URLs. */
  mono?: boolean;
}

export interface DefinitionListProps {
  items: readonly Definition[];
  className?: string;
}

export function DefinitionList({ items, className }: DefinitionListProps) {
  return (
    <dl
      className={cn(
        "grid min-w-0 grid-cols-[minmax(8rem,auto)_1fr] gap-x-6 gap-y-2 text-sm",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.term} className="contents">
          <dt className="text-muted-foreground">{item.term}</dt>
          <dd
            className={cn(
              "min-w-0 [overflow-wrap:anywhere]",
              item.mono && "font-mono text-xs leading-5",
            )}
          >
            {item.value ?? "None"}
          </dd>
        </div>
      ))}
    </dl>
  );
}
