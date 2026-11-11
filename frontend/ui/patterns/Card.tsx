import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface CardProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** A short heading inside the box. */
  title?: React.ReactNode;
  /** One control beside the title (a link, a small button). */
  action?: React.ReactNode;
  headingLevel?: "h3" | "h4";
}

/**
 * The bordered box of `PageFrame > Section > Card`. The second container
 * level, so it never holds a Section or another Card. A candidate for
 * @calliopelabs/ui, which has Section but no Card.
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
        "flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground",
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="flex items-start justify-between gap-3">
          {title && (
            <Heading className="text-sm font-medium [overflow-wrap:anywhere]">
              {title}
            </Heading>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
