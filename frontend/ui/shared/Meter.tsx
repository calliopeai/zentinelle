import { TONE_TOKEN, cn, type StatusTone } from "@calliopelabs/ui";

export interface MeterProps {
  /** Names the measure ("Required controls covered", "Context window"). */
  label: string;
  /** 0 to `max`. Over `max` draws full, in the warning colour. */
  value: number;
  max: number;
  /** The figure beside the bar ("12% of 200K tokens"). Defaults to "value of max". */
  valueText?: string;
  /** The fill's tone; absent, the primary colour. */
  tone?: StatusTone;
  /** Hide the label row, when the label is already beside the meter. */
  compact?: boolean;
  className?: string;
}

const FILL: Record<StatusTone, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  error: "bg-danger",
  info: "bg-info",
  muted: "bg-muted-foreground",
};

/**
 * A measure against its ceiling: coverage, a budget, a context window. A
 * meter, not a progress bar: nothing is loading.
 */
export function Meter({
  label,
  value,
  max,
  valueText,
  tone,
  compact = false,
  className,
}: MeterProps) {
  const ratio = max > 0 ? Math.max(0, value / max) : 0;
  const over = ratio > 1;
  const text = valueText ?? `${value} of ${max}`;
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      {!compact && (
        <div className="flex items-baseline justify-between gap-3 text-sm">
          <span className="min-w-0 truncate">{label}</span>
          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {text}
          </span>
        </div>
      )}
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={text}
        data-tone={tone ? TONE_TOKEN[tone] : undefined}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            "h-full rounded-full",
            over ? "bg-warning" : tone ? FILL[tone] : "bg-primary",
          )}
          style={{ width: `${Math.min(ratio, 1) * 100}%` }}
        />
      </div>
    </div>
  );
}
