import { Input, cn } from "@calliopelabs/ui";
import * as React from "react";

const CONTROL =
  "border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 w-full min-w-0 rounded-lg border bg-transparent px-2.5 py-1 text-base outline-none transition-colors focus-visible:ring-3 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 md:text-sm";

interface FieldBase {
  label: string;
  /** Help under the control. */
  hint?: React.ReactNode;
  /** The validation message; marks the control invalid. */
  error?: string;
  className?: string;
}

function useIds(hint: unknown, error: unknown) {
  const id = React.useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return {
    id,
    hintId,
    errorId,
    describedBy: [hintId, errorId].filter(Boolean).join(" ") || undefined,
  };
}

function Frame({
  id,
  label,
  hint,
  hintId,
  error,
  errorId,
  className,
  required,
  children,
}: FieldBase & {
  id: string;
  hintId?: string;
  errorId?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && (
          <span aria-hidden className="text-muted-foreground">
            {" "}
            (required)
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-muted-foreground text-xs">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-danger-fg text-xs">
          {error}
        </p>
      )}
    </div>
  );
}

export type TextFieldProps = FieldBase &
  Omit<React.ComponentProps<"input">, "id" | "className">;

/** A labelled text input, with its hint and error tied to it. Candidate for @calliopelabs/ui. */
export function TextField({
  label,
  hint,
  error,
  className,
  ...props
}: TextFieldProps) {
  const ids = useIds(hint, error);
  return (
    <Frame
      {...{ label, hint, error, className, required: props.required }}
      {...ids}
    >
      <Input
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        {...props}
      />
    </Frame>
  );
}

export type TextareaFieldProps = FieldBase &
  Omit<React.ComponentProps<"textarea">, "id" | "className">;

/** A labelled multi-line input. Candidate for @calliopelabs/ui. */
export function TextareaField({
  label,
  hint,
  error,
  className,
  ...props
}: TextareaFieldProps) {
  const ids = useIds(hint, error);
  return (
    <Frame
      {...{ label, hint, error, className, required: props.required }}
      {...ids}
    >
      <textarea
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cn(CONTROL, "min-h-20 py-2")}
        {...props}
      />
    </Frame>
  );
}

export interface SelectOption {
  value: string;
  label: string;
}

export type SelectFieldProps = FieldBase &
  Omit<React.ComponentProps<"select">, "id" | "className" | "children"> & {
    options: readonly SelectOption[];
    /** A first, empty option ("Choose a type"). */
    placeholder?: string;
  };

/** A labelled native select: keyboard and screen reader behaviour for free. Candidate for @calliopelabs/ui. */
export function SelectField({
  label,
  hint,
  error,
  className,
  options,
  placeholder,
  ...props
}: SelectFieldProps) {
  const ids = useIds(hint, error);
  return (
    <Frame
      {...{ label, hint, error, className, required: props.required }}
      {...ids}
    >
      <select
        id={ids.id}
        aria-invalid={error ? true : undefined}
        aria-describedby={ids.describedBy}
        className={cn(CONTROL, "bg-background h-8")}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Frame>
  );
}
