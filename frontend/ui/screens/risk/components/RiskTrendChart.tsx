import { cn } from "@calliopelabs/ui";

import type { RiskTrendPoint } from "../rest-types";
import { formatDate } from "../model";

export interface RiskTrendChartProps {
  points: readonly RiskTrendPoint[];
  className?: string;
}

const W = 600;
const H = 120;

/**
 * The risk index (0 to 100) day by day, from `risks/trend`. A line for the
 * eye and a table for a screen reader; the server computes every point.
 */
export function RiskTrendChart({ points, className }: RiskTrendChartProps) {
  const last = points.at(-1);
  const first = points[0];
  const step = points.length > 1 ? W / (points.length - 1) : 0;
  const path = points
    .map(
      (p, i) =>
        `${i === 0 ? "M" : "L"}${(i * step).toFixed(1)},${(H - (p.index / 100) * H).toFixed(1)}`,
    )
    .join(" ");
  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-28 w-full"
        aria-hidden
      >
        {[25, 50, 75].map((y) => (
          <line
            key={y}
            x1={0}
            x2={W}
            y1={H - (y / 100) * H}
            y2={H - (y / 100) * H}
            className="stroke-border"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        ))}
        <path
          d={path}
          fill="none"
          className="stroke-primary"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <figcaption className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span>{formatDate(first?.day)}</span>
        <span>
          Today: index {last?.index ?? 0}, {last?.open_count ?? 0} open
        </span>
      </figcaption>
      <table className="sr-only">
        <caption>Risk index by day</caption>
        <thead>
          <tr>
            <th scope="col">Day</th>
            <th scope="col">Index</th>
            <th scope="col">Open risks</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.day}>
              <td>{p.day}</td>
              <td>{p.index}</td>
              <td>{p.open_count}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
