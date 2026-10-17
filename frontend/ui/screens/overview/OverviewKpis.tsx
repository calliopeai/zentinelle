import { StatTile } from "../../components/StatTile";
import { formatCount, type Kpi } from "./overview-model";

export interface OverviewKpisProps {
  kpis: readonly Kpi[];
  loading?: boolean;
}

/** The four headline numbers, each a link into the area it counts. */
export function OverviewKpis({ kpis, loading = false }: OverviewKpisProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {kpis.map((kpi) => (
        <StatTile
          key={kpi.key}
          label={kpi.label}
          value={formatCount(kpi.value)}
          detail={kpi.detail}
          href={kpi.href}
          tone={kpi.tone}
          loading={loading}
        />
      ))}
    </div>
  );
}
