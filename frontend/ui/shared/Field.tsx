import { cn } from "@calliopelabs/ui";
import * as React from "react";

export interface FieldProps {
  label: React.ReactNode;
  /** Help under the control. */
  hint?: React.ReactNode;
  /** The validation message; the control is marked invalid while it is set. */
  error?: React.ReactNode;
  /** The control's id. Defaults to a generated one. */
  id?: string;
  /** The control, given the id, its description ids and its invalid state. */
  children: (control: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: true;
  }) => React.ReactNode;
  className?: string;
}

/** A labelled form control with its hint and its error, wired for assistive tech. */
export function Field({
  label,
  hint,
  error,
  id: idProp,
  children,
  className,
}: FieldProps) {
  const generated = React.useId();
  const id = idProp ?? generated;
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children({
        id,
        "aria-describedby": describedBy,
        ...(error ? { "aria-invalid": true as const } : {}),
      })}
      {hint && (
        <p id={hintId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
