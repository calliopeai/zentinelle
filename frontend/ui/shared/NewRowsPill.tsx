import { Button, cn } from "@calliopelabs/ui";
import { ArrowUpIcon } from "lucide-react";

export interface NewRowsPillProps {
  /** Rows that arrived and are held back, so the list does not move under the reader. */
  count: number;
  onShow: () => void;
  /** "3 new events". */
  label?: (count: number) => string;
  className?: string;
}

/** The pill over a live list: new rows wait until the reader asks for them. Renders nothing at zero. */
export function NewRowsPill({
  count,
  onShow,
  label = (n) => `${n} new ${n === 1 ? "row" : "rows"}`,
  className,
}: NewRowsPillProps) {
  if (count <= 0) return null;
  return (
    <div className={cn("flex justify-center", className)} aria-live="polite">
      <Button size="sm" className="rounded-full" onClick={onShow}>
        <ArrowUpIcon aria-hidden />
        {label(count)}
      </Button>
    </div>
  );
}
