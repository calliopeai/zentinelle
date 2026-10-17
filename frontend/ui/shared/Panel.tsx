import { cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface PanelProps extends Omit<React.ComponentProps<"div">, "title"> {
  /** A small heading inside the box. For a page region use Section instead. */
  title?: React.ReactNode;
  /** Beside the title: a link, a count. */
  action?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * The one bordered box (a Card): the inner level of `PageFrame > Section >
 * Panel`. Never nest one Panel in another.
 */
export function Panel({
  title,
  action,
  className,
  children,
  ...props
}: PanelProps) {
  return (
    <div
      {...props}
      className={cn(
        "flex min-w-0 flex-col gap-3 rounded-lg border bg-card p-4 text-card-foreground",
        className,
      )}
    >
      {(title || action) && (
        <div className="flex min-w-0 items-center justify-between gap-3">
          {title && <h3 className="min-w-0 text-sm font-medium">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
