import { Button, cn } from "@calliopelabs/ui";
import type * as React from "react";

export interface FilterBarProps {
  /** Labels the group ("Policy filters"). */
  label: string;
  /** Filter controls: Selects with `aria-label`, toggles, a date range. */
  children: React.ReactNode;
  /** Shown while any filter narrows the list. */
  onClear?: () => void;
  clearLabel?: string;
  className?: string;
}

/** The filters of a list, in one wrapping row, with a way back to everything. */
export function FilterBar({
  label,
  children,
  onClear,
  clearLabel = "Clear filters",
  className,
}: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {children}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      )}
    </div>
  );
}
