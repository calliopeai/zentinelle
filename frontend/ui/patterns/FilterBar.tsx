import type * as React from "react";
import { Button, Input, cn } from "@calliopelabs/ui";
import { SearchIcon } from "lucide-react";

import { Select, type SelectOption } from "./form";

export interface FilterSpec {
  key: string;
  /** The select's accessible name, and its "any" option ("Any status"). */
  label: string;
  anyLabel: string;
  options: readonly SelectOption[];
}

export interface FilterBarProps {
  /** Names the search box; absent, there is no search (the query takes none). */
  searchLabel?: string;
  search?: string;
  onSearchChange?: (search: string) => void;
  filters: readonly FilterSpec[];
  values: Readonly<Record<string, string>>;
  onChange: (key: string, value: string) => void;
  onClear: () => void;
  /** Anything on the right: a view switch, an export menu. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * Search and filter selects above a list, each a server argument. Clear
 * shows only while something narrows the list. A candidate for
 * @calliopelabs/ui (Astrolift's FilterBar); the package's DataTable has a
 * search box and a toolbar slot, but no filter set of its own.
 */
export function FilterBar({
  searchLabel,
  search = "",
  onSearchChange,
  filters,
  values,
  onChange,
  onClear,
  trailing,
  className,
}: FilterBarProps) {
  const narrowed =
    search.trim() !== "" || filters.some((filter) => values[filter.key]);
  return (
    <div
      role="search"
      aria-label="Filters"
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
      {filters.map((filter) => (
        <Select
          key={filter.key}
          aria-label={filter.label}
          placeholder={filter.anyLabel}
          options={filter.options}
          value={values[filter.key] ?? ""}
          onChange={(event) => onChange(filter.key, event.target.value)}
          className="w-auto"
        />
      ))}
      {narrowed && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters
        </Button>
      )}
      {trailing && <div className="ml-auto flex items-center">{trailing}</div>}
    </div>
  );
}
