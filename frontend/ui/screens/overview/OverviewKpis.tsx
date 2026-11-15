import { useLocale, useTranslations } from "next-intl";

import { StatTile } from "../../components/StatTile";
import { formatCount } from "../../shared/figures";
import type { Kpi } from "./overview-model";

export interface OverviewKpisProps {
  kpis: readonly Kpi[];
  loading?: boolean;
}

/** The four headline numbers, each a link into the area it counts. */
export function OverviewKpis({ kpis, loading = false }: OverviewKpisProps) {
  const t = useTranslations("overview.kpis");
  const locale = useLocale();
  return (
    <div
      data-tour="dashboard-stats"
      className="grid grid-cols-2 gap-3 lg:grid-cols-4"
    >
      {kpis.map((kpi) => (
        <StatTile
          key={kpi.key}
          label={t(`${kpi.key}.label`)}
          value={kpi.value === null ? null : formatCount(kpi.value, locale)}
          detail={kpi.detail ? t(kpi.detail.key, kpi.detail.values) : null}
          href={kpi.href}
          tone={kpi.tone}
          unavailableLabel={t("unavailable")}
          loading={loading}
        />
      ))}
    </div>
  );
}
