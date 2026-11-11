import { cn } from "@calliopelabs/ui";

export interface MeterProps {
  label: string;
  /** 0 to `max`. Over `max` draws full, in the warning colour. */
  value: number;
  max: number;
  /** The figure in words ("12% of 200K tokens"). */
  valueText: string;
  className?: string;
}

/** How much of a limit is used: a context window, a budget. */
export function Meter({ label, value, max, valueText, className }: MeterProps) {
  const ratio = max > 0 ? value / max : 0;
  const over = ratio > 1;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex items-baseline justify-between gap-3 text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-mono tabular-nums">{valueText}</span>
      </div>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={valueText}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full", over ? "bg-warning" : "bg-primary")}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
    </div>
  );
}
