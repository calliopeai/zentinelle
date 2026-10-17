import { Input, cn } from "@calliopelabs/ui";
import * as React from "react";

export interface DateRange {
  /** ISO date (YYYY-MM-DD), or "" for open. */
  from: string;
  to: string;
}

export interface DateRangeFilterProps {
  value: DateRange;
  onChange: (value: DateRange) => void;
  fromLabel?: string;
  toLabel?: string;
  className?: string;
}

/** A from and to date for a list whose query filters by time. Either end may be open. */
export function DateRangeFilter({
  value,
  onChange,
  fromLabel = "From",
  toLabel = "To",
  className,
}: DateRangeFilterProps) {
  const id = React.useId();
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <label htmlFor={`${id}-from`} className="text-xs text-muted-foreground">
        {fromLabel}
      </label>
      <Input
        id={`${id}-from`}
        type="date"
        value={value.from}
        max={value.to || undefined}
        onChange={(event) => onChange({ ...value, from: event.target.value })}
        className="w-36"
      />
      <label htmlFor={`${id}-to`} className="text-xs text-muted-foreground">
        {toLabel}
      </label>
      <Input
        id={`${id}-to`}
        type="date"
        value={value.to}
        min={value.from || undefined}
        onChange={(event) => onChange({ ...value, to: event.target.value })}
        className="w-36"
      />
    </div>
  );
}
