"use client";

import { cn } from "@calliopelabs/ui";
import * as React from "react";

export interface TrendPoint {
  /** The axis label, already formatted ("Oct 16"). */
  label: string;
  value: number | null;
  /** The expected range at this point, when there is a baseline. */
  band?: { lower: number; upper: number } | null;
  /** Drawn as a marked point: a detection, a breach. */
  marked?: boolean;
}

export interface TrendChartProps {
  /** Names the chart; also its caption. */
  label: string;
  points: readonly TrendPoint[];
  kind?: "line" | "bar";
  formatValue?: (value: number) => string;
  /** Names the band and the marks in the legend. */
  bandLabel?: string;
  markLabel?: string;
  /** Shown instead of the chart when there is too little to draw. */
  emptyLabel?: string;
  /** Pixels. */
  height?: number;
  className?: string;
}

const W = 600;

/**
 * A day-by-day series as a line or bars, with an optional expected band and
 * marked points. Server aggregates only: it draws what it is given and
 * computes nothing. The values are also a visually hidden table, so the chart
 * reads without the picture.
 */
export function TrendChart({
  label,
  points,
  kind = "line",
  formatValue = (v) => String(v),
  bandLabel = "Expected range",
  markLabel = "Anomaly",
  emptyLabel = "Not enough data to draw yet.",
  height = 160,
  className,
}: TrendChartProps) {
  const captionId = React.useId();
  const values = points.map((p) => p.value ?? 0);
  const enough = kind === "bar" ? points.length > 0 : points.length > 1;
  const hasBand = points.some((p) => p.band);
  const hasMarks = points.some((p) => p.marked);
  const max = Math.max(1, ...values, ...points.map((p) => p.band?.upper ?? 0));
  const x = (i: number) =>
    kind === "bar"
      ? (i + 0.5) * (W / points.length)
      : (i / Math.max(points.length - 1, 1)) * W;
  const y = (v: number) => height - (v / max) * (height - 8);

  const line = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value ?? 0)}`)
    .join(" ");
  const banded = points.map((p, i) => ({ p, i })).filter(({ p }) => p.band);
  const band =
    banded.length > 1
      ? [
          ...banded.map(
            ({ p, i }, k) =>
              `${k === 0 ? "M" : "L"}${x(i)},${y(p.band!.upper)}`,
          ),
          ...banded
            .slice()
            .reverse()
            .map(({ p, i }) => `L${x(i)},${y(p.band!.lower)}`),
          "Z",
        ].join(" ")
      : null;
  const barWidth = (W / Math.max(points.length, 1)) * 0.6;

  return (
    <figure
      aria-labelledby={captionId}
      className={cn("flex min-w-0 flex-col gap-2", className)}
    >
      <figcaption className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span id={captionId} className="font-medium text-foreground">
          {label}
        </span>
        {enough && hasBand && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-sm bg-chart-2/30"
            />
            {bandLabel}
          </span>
        )}
        {enough && hasMarks && (
          <span className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-2.5 rounded-full bg-danger"
            />
            {markLabel}
          </span>
        )}
      </figcaption>
      {enough ? (
        <>
          <div className="relative">
            <span className="absolute top-0 left-0 font-mono text-2xs text-muted-foreground">
              {formatValue(max)}
            </span>
            <svg
              aria-hidden
              viewBox={`0 0 ${W} ${height}`}
              preserveAspectRatio="none"
              className="block w-full overflow-visible"
              style={{ height }}
            >
              <line
                x1={0}
                x2={W}
                y1={height}
                y2={height}
                className="stroke-border"
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
              {band && (
                <path d={band} className="fill-chart-2" fillOpacity={0.18} />
              )}
              {kind === "line" ? (
                <path
                  d={line}
                  fill="none"
                  className="stroke-chart-1"
                  strokeWidth={2}
                  vectorEffect="non-scaling-stroke"
                />
              ) : (
                points.map((p, i) => (
                  <rect
                    key={i}
                    x={x(i) - barWidth / 2}
                    width={barWidth}
                    y={y(p.value ?? 0)}
                    height={height - y(p.value ?? 0)}
                    className={p.marked ? "fill-danger" : "fill-chart-1"}
                  />
                ))
              )}
              {kind === "line" &&
                points.map((p, i) =>
                  p.marked ? (
                    <circle
                      key={i}
                      cx={x(i)}
                      cy={y(p.value ?? 0)}
                      r={4}
                      className="fill-danger"
                    />
                  ) : null,
                )}
            </svg>
          </div>
          <div className="flex justify-between font-mono text-2xs text-muted-foreground">
            <span>{points[0]?.label}</span>
            <span>{points[points.length - 1]?.label}</span>
          </div>
          <table className="sr-only">
            <caption>{label}</caption>
            <thead>
              <tr>
                <th scope="col">Day</th>
                <th scope="col">Value</th>
                {hasBand && <th scope="col">{bandLabel}</th>}
                {hasMarks && <th scope="col">{markLabel}</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <th scope="row">{p.label}</th>
                  <td>{p.value == null ? "" : formatValue(p.value)}</td>
                  {hasBand && (
                    <td>
                      {p.band
                        ? `${formatValue(p.band.lower)} to ${formatValue(p.band.upper)}`
                        : ""}
                    </td>
                  )}
                  {hasMarks && <td>{p.marked ? markLabel : ""}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      ) : (
        <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          {emptyLabel}
        </p>
      )}
    </figure>
  );
}
