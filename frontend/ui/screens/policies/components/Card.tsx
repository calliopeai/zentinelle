import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface CardProps extends Omit<React.ComponentProps<"div">, "title"> {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** Controls beside the title. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * One bordered panel inside a Section: the second and last container level
 * (`PageFrame > Section > Card`). Never put a Card in a Card.
 */
export function Card({
  title,
  description,
  action,
  children,
  className,
  ...props
}: CardProps) {
  return (
    <div
      data-slot="card"
      className={cn(
        "min-w-0 rounded-lg border border-border bg-card p-4 text-card-foreground",
        className,
      )}
      {...props}
    >
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && (
              <h3 className="text-sm font-semibold [overflow-wrap:anywhere]">
                {title}
              </h3>
            )}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">
                {description}
              </p>
            )}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
