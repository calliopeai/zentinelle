import { Stat, StatGrid } from "@calliopelabs/ui";
import { useLocale, useTranslations } from "next-intl";

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
    <div data-tour="dashboard-stats">
      <StatGrid>
        {kpis.map((kpi) => {
          const detail = kpi.detail
            ? t(kpi.detail.key, kpi.detail.values)
            : null;
          return (
            <Stat
              key={kpi.key}
              label={t(`${kpi.key}.label`)}
              value={kpi.value === null ? null : formatCount(kpi.value, locale)}
              hint={
                kpi.value === null
                  ? [t("unavailable"), detail].filter(Boolean).join(" · ")
                  : detail
              }
              href={kpi.href}
              tone={kpi.tone}
              loading={loading}
            />
          );
        })}
      </StatGrid>
    </div>
  );
}
