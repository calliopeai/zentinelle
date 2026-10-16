import { cn } from "@calliopelabs/ui";
import * as React from "react";

export interface FilterOption {
  value: string;
  label: string;
}

export interface FilterSelectProps {
  /** The visible label ("Severity"). */
  label: string;
  /** The chosen value; "" is every value. */
  value: string;
  options: readonly FilterOption[];
  onChange: (value: string) => void;
  /** The label of the unfiltered choice. Defaults to "All". */
  allLabel?: string;
  className?: string;
}

/**
 * One server-side filter beside a list's search: a labelled native select,
 * so it works with the keyboard, on touch and with a screen reader without a
 * popover. "" means unfiltered.
 */
export function FilterSelect({
  label,
  value,
  options,
  onChange,
  allLabel = "All",
  className,
}: FilterSelectProps) {
  const id = React.useId();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 rounded-lg border border-input bg-background px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
