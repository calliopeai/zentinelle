import {
  Button,
  ErrorState,
  PageFrame,
  Section,
  useUI,
} from "@calliopelabs/ui";
import { SparklesIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import { NeedsAttention } from "./NeedsAttention";
import { OnboardingCard } from "./OnboardingCard";
import { OverviewKpis } from "./OverviewKpis";
import type { Kpi, OverviewData } from "./overview-model";
import { RecentActivity } from "./RecentActivity";

export interface OverviewScreenProps {
  /** `null` while the first answer is on its way. */
  data: OverviewData | null;
  loading?: boolean;
  /** DashboardStats failed: there is no overview to show. */
  error?: { message: string } | null;
  /** A secondary signal (risk statistics, alerts) failed; the rest shows. */
  attentionError?: { message: string } | null;
  canMutate: boolean;
  onRetry?: () => void;
  now?: Date;
}

const PLACEHOLDER_KPIS: Kpi[] = (
  ["agents", "policies", "incidents", "events"] as const
).map((key) => ({ key, value: null, detail: null, href: "/dashboard" }));

/**
 * Overview (`/dashboard`; `/governance` and `/demo` redirect here): headline
 * numbers that link into their areas, what needs attention, the setup steps
 * while any are left, and the latest activity. One screen, no charts,
 * nothing that needs a whole list. The assistant is one link away.
 */
export function OverviewScreen({
  data,
  loading = false,
  error,
  attentionError,
  canMutate,
  onRetry,
  now,
}: OverviewScreenProps) {
  const { Link } = useUI();
  const t = useTranslations("overview.screen");
  const assistant = (
    <Button asChild variant="outline" size="sm">
      <Link href="/assistant">
        <SparklesIcon aria-hidden />
        {t("openAssistant")}
      </Link>
    </Button>
  );
  if (error) {
    return (
      <PageFrame title={t("title")} primaryAction={assistant}>
        <ErrorState title={t("error")} error={error} onRetry={onRetry} />
      </PageFrame>
    );
  }
  const pending = loading || !data;
  return (
    <PageFrame
      title={t("title")}
      description={t("description")}
      primaryAction={assistant}
    >
      <div className="space-y-8">
        <Section title={t("atAGlance")}>
          <OverviewKpis
            kpis={data?.kpis ?? PLACEHOLDER_KPIS}
            loading={pending}
          />
        </Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title={t("needsAttention")}>
            <NeedsAttention
              items={data?.attention ?? []}
              loading={pending}
              error={pending ? null : attentionError}
              onRetry={onRetry}
            />
          </Section>
          {data?.onboarding && (
            <Section title={t("getStarted")}>
              <OnboardingCard steps={data.onboarding} canMutate={canMutate} />
            </Section>
          )}
          <Section
            title={t("recentActivity")}
            action={
              <Link
                href="/audit-logs"
                className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
              >
                {t("auditLog")}
              </Link>
            }
            className={data?.onboarding ? "lg:col-span-2" : undefined}
          >
            <RecentActivity
              entries={data?.activity ?? []}
              loading={pending}
              now={now}
            />
          </Section>
        </div>
      </div>
    </PageFrame>
  );
}
