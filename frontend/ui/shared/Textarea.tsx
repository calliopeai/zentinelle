import { cn } from "@calliopelabs/ui";
import type * as React from "react";

import { CONTROL_CLASS } from "./controls";

/** A multi-line text box on the Input recipe. `mono` for code, JSON and prompts. */
export function Textarea({
  className,
  mono,
  ...props
}: React.ComponentProps<"textarea"> & { mono?: boolean }) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        CONTROL_CLASS,
        "min-h-24 py-2",
        mono && "font-mono text-xs md:text-xs",
        className,
      )}
      {...props}
    />
  );
}
