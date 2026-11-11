import { cn } from "@calliopelabs/ui";

import type { RiskData } from "@/graphql/risks/types";

import { IMPACT, LIKELIHOOD } from "../model";

export interface RiskMatrixProps {
  risks: readonly Pick<RiskData, "id" | "likelihood" | "impact">[];
  /** The cell on show below the matrix, if any. */
  selected?: { likelihood: number; impact: number } | null;
  onSelect: (cell: { likelihood: number; impact: number } | null) => void;
  className?: string;
}

/** Likelihood times impact, the heat of a cell without the severity factor. */
function heat(likelihood: number, impact: number) {
  const product = likelihood * impact;
  if (product >= 40) return "bg-danger/30";
  if (product >= 15) return "bg-danger/15";
  if (product >= 6) return "bg-warning/15";
  return "bg-success/10";
}

/**
 * The register as a likelihood by impact grid: how many risks sit in each
 * cell of the five-point Fibonacci scales. A table, so a screen reader reads
 * the axes; a cell with risks is a button that shows them below.
 */
export function RiskMatrix({
  risks,
  selected,
  onSelect,
  className,
}: RiskMatrixProps) {
  const count = (likelihood: number, impact: number) =>
    risks.filter((r) => r.likelihood === likelihood && r.impact === impact)
      .length;
  return (
    <div className={cn("@container overflow-x-auto", className)}>
      <table className="w-full min-w-lg table-fixed border-separate border-spacing-1 text-sm">
        <caption className="pb-2 text-left text-xs text-muted-foreground">
          Risks by likelihood (rows) and impact (columns)
        </caption>
        <thead>
          <tr>
            <th scope="col" className="w-32">
              <span className="sr-only">Likelihood</span>
            </th>
            {IMPACT.map((impact) => (
              <th
                key={impact.value}
                scope="col"
                className="pb-1 text-xs font-normal text-muted-foreground"
              >
                {impact.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {LIKELIHOOD.map((likelihood) => (
            <tr key={likelihood.value}>
              <th
                scope="row"
                className="pr-2 text-right text-xs font-normal text-muted-foreground"
              >
                {likelihood.label}
              </th>
              {IMPACT.map((impact) => {
                const n = count(likelihood.value, impact.value);
                const isSelected =
                  selected?.likelihood === likelihood.value &&
                  selected?.impact === impact.value;
                const cellClass = cn(
                  "flex h-12 w-full items-center justify-center rounded-md font-mono tabular-nums",
                  n > 0 ? heat(likelihood.value, impact.value) : "bg-muted/30",
                  isSelected && "ring-2 ring-ring",
                );
                return (
                  <td key={impact.value} className="p-0">
                    {n > 0 ? (
                      <button
                        type="button"
                        aria-pressed={isSelected}
                        aria-label={`${n} ${n === 1 ? "risk" : "risks"}, likelihood ${likelihood.label}, impact ${impact.label}`}
                        className={cn(
                          cellClass,
                          "font-semibold outline-none hover:ring-1 hover:ring-ring focus-visible:ring-2 focus-visible:ring-ring",
                        )}
                        onClick={() =>
                          onSelect(
                            isSelected
                              ? null
                              : {
                                  likelihood: likelihood.value,
                                  impact: impact.value,
                                },
                          )
                        }
                      >
                        {n}
                      </button>
                    ) : (
                      <span className={cn(cellClass, "text-muted-foreground")}>
                        <span aria-hidden>0</span>
                        <span className="sr-only">No risks</span>
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
