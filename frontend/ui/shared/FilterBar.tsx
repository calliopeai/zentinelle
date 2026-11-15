import { Button, Input, cn } from "@calliopelabs/ui";
import { SearchIcon } from "lucide-react";
import type * as React from "react";

export interface FilterBarProps {
  /** Labels the group ("Policy filters"). */
  label: string;
  /** Filter controls: Selects with `aria-label`, toggles, a date range. */
  children?: React.ReactNode;
  /** Names the search box; absent, there is no search (the query takes none). */
  searchLabel?: string;
  search?: string;
  onSearchChange?: (search: string) => void;
  /** Shown while any filter narrows the list. */
  onClear?: () => void;
  clearLabel?: string;
  /** Anything on the right: a view switch, an export menu. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * The filters of a list, in one wrapping row, with a way back to everything.
 * Each is a server argument. Use the DataTable's own search box where the
 * table draws one; the search here is for filters that sit above the page.
 */
export function FilterBar({
  label,
  children,
  searchLabel,
  search = "",
  onSearchChange,
  onClear,
  clearLabel = "Clear filters",
  trailing,
  className,
}: FilterBarProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {searchLabel && onSearchChange && (
        <div className="relative w-full sm:w-64">
          <SearchIcon
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            aria-label={searchLabel}
            placeholder={searchLabel}
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="pl-8"
          />
        </div>
      )}
      {children}
      {onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          {clearLabel}
        </Button>
      )}
      {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
    </div>
  );
}
