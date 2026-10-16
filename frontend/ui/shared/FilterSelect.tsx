import { cn } from "@calliopelabs/ui";
import * as React from "react";

import type { SelectOption } from "./FormField";

export interface FilterSelectProps {
  /** Names the filter ("Status"); visible, so the bar reads without opening anything. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** The option that clears the filter. Defaults to "All". */
  allLabel?: string;
  className?: string;
}

/**
 * One filter in a list's filter bar, for a query variable the server
 * filters on. The empty value means "no filter". Candidate for
 * @calliopelabs/ui, as part of a FilterBar (Astrolift's list pattern).
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel = "All",
  className,
}: FilterSelectProps) {
  const id = React.useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 h-8 rounded-lg border px-2 text-sm outline-none focus-visible:ring-3"
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
