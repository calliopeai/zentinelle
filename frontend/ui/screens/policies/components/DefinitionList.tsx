import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface DefinitionItem {
  term: string;
  description: React.ReactNode;
}

export interface DefinitionListProps {
  items: readonly DefinitionItem[];
  /** `columns` sets term and value side by side from `sm` up; `stacked` always stacks. */
  layout?: "columns" | "stacked";
  className?: string;
}

/** Facts about one thing, term then value: an entity's properties. */
export function DefinitionList({
  items,
  layout = "columns",
  className,
}: DefinitionListProps) {
  return (
    <dl
      className={cn(
        "grid gap-x-6 gap-y-2 text-sm",
        layout === "columns" && "sm:grid-cols-[minmax(8rem,auto)_1fr]",
        className,
      )}
    >
      {items.map((item) => (
        <div key={item.term} className="contents">
          <dt className="text-muted-foreground">{item.term}</dt>
          <dd className="min-w-0 [overflow-wrap:anywhere]">
            {item.description}
          </dd>
        </div>
      ))}
    </dl>
  );
}
