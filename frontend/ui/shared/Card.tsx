import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface CardProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** A short heading inside the box. */
  title?: React.ReactNode;
  /** Controls beside the title. */
  action?: React.ReactNode;
  /** h3 by default: a card sits inside a Section, whose heading is the h2. */
  headingLevel?: "h3" | "h4";
}

/**
 * One bordered box: the last container level of
 * `PageFrame > Section > Card` (ui-overhaul-ia §5). Never nest a Card in a
 * Card, and never put a Section inside one. Candidate for @calliopelabs/ui,
 * which has Section but no Card yet.
 */
export function Card({
  title,
  action,
  headingLevel = "h3",
  className,
  children,
  ...props
}: CardProps) {
  const Heading = headingLevel;
  return (
    <div
      data-slot="card"
      className={cn(
        "bg-card text-card-foreground flex min-w-0 flex-col gap-3 rounded-lg border p-4",
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex min-w-0 items-center justify-between gap-2">
          {title && (
            <Heading className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
              {title}
            </Heading>
          )}
          {action && <div className="flex shrink-0 gap-2">{action}</div>}
        </div>
      )}
      {children}
    </div>
  );
}
