import { cn } from "@calliopelabs/ui";
import type * as React from "react";

import { CONTROL_CLASS } from "./controls";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<
  React.ComponentProps<"select">,
  "onChange" | "value"
> {
  options: readonly SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
}

/**
 * A native select on the Input recipe: keyboard, screen reader and mobile
 * pickers work as the platform makes them. Name it with a Field, a label, or
 * `aria-label`.
 */
export function Select({
  options,
  value,
  onValueChange,
  className,
  ...props
}: SelectProps) {
  return (
    <select
      data-slot="select"
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      className={cn(CONTROL_CLASS, "h-8 bg-background pr-7", className)}
      {...props}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
