import { TONE_TOKEN, cn, type StatusTone } from "@calliopelabs/ui";

export interface MeterProps {
  /** Names the measure ("Required controls covered"). */
  label: string;
  value: number;
  max: number;
  /** The figure beside the bar. Defaults to "value of max". */
  valueText?: string;
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
 * A measure against its ceiling: coverage, budget, a share. A meter, not a
 * progress bar: nothing is loading. A candidate for @calliopelabs/ui.
 */
export function Meter({
  label,
  value,
  max,
  valueText,
  tone = "info",
  compact = false,
  className,
}: MeterProps) {
  const share = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
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
        aria-valuenow={value}
        aria-valuetext={text}
        data-tone={TONE_TOKEN[tone] ?? "muted"}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", FILL[tone])}
          style={{ width: `${share * 100}%` }}
        />
      </div>
    </div>
  );
}
