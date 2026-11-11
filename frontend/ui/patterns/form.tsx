import { cn } from "@calliopelabs/ui";
import * as React from "react";

const CONTROL =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-3 py-1.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-danger";

export interface FieldProps {
  label: string;
  /** Under the label: what the value means or how it is used. */
  hint?: string;
  error?: string | null;
  required?: boolean;
  /** The control. It receives the id, the description and the invalid state. */
  children: React.ReactElement<{
    id?: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
    required?: boolean;
  }>;
  className?: string;
}

/**
 * A labelled form control with its hint and error, wired for screen readers.
 * With Select and Textarea, a candidate for @calliopelabs/ui, which has Input
 * and Checkbox but no field, select or textarea.
 */
export function Field({
  label,
  hint,
  error,
  required,
  children,
  className,
}: FieldProps) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-muted-foreground">
            {" "}
            *
          </span>
        )}
      </label>
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {React.cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
        required,
      })}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<
  React.ComponentProps<"select">,
  "children"
> {
  options: readonly SelectOption[];
  /** A first option with an empty value ("Any category"). */
  placeholder?: string;
}

/** A native select on the family tokens: keyboard and screen reader support for free. */
export function Select({
  options,
  placeholder,
  className,
  ...props
}: SelectProps) {
  return (
    <select className={cn(CONTROL, "h-9", className)} {...props}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Textarea({
  className,
  rows = 4,
  ...props
}: React.ComponentProps<"textarea">) {
  return <textarea rows={rows} className={cn(CONTROL, className)} {...props} />;
}
