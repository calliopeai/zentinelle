import { ErrorState, PageFrame, Section, useUI } from "@calliopelabs/ui";

import { NeedsAttention } from "./NeedsAttention";
import { OnboardingCard } from "./OnboardingCard";
import { OverviewKpis } from "./OverviewKpis";
import type { OverviewData } from "./overview-model";
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

const PLACEHOLDER_KPIS = [
  "Agents",
  "Policies",
  "Open incidents",
  "Events today",
].map((label) => ({
  key: label,
  label,
  value: null,
  detail: "",
  href: "/dashboard",
}));

/**
 * Overview (`/dashboard`, also `/governance`): headline numbers that link
 * into their areas, what needs attention, the setup steps while any are
 * left, and the latest activity. One screen, no charts, nothing that needs a
 * whole list.
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
  if (error) {
    return (
      <PageFrame title="Overview">
        <ErrorState
          title="Could not load the overview"
          error={error}
          onRetry={onRetry}
        />
      </PageFrame>
    );
  }
  const pending = loading || !data;
  return (
    <PageFrame
      title="Overview"
      description="What your agents are doing, and what needs someone now."
    >
      <div className="space-y-8">
        <Section title="At a glance">
          <OverviewKpis
            kpis={data?.kpis ?? PLACEHOLDER_KPIS}
            loading={pending}
          />
        </Section>
        <div className="grid gap-8 lg:grid-cols-2">
          <Section title="Needs attention">
            <NeedsAttention
              items={data?.attention ?? []}
              loading={pending}
              error={pending ? null : attentionError}
              onRetry={onRetry}
            />
          </Section>
          {data?.onboarding && (
            <Section title="Get started">
              <OnboardingCard steps={data.onboarding} canMutate={canMutate} />
            </Section>
          )}
          <Section
            title="Recent activity"
            action={
              <Link
                href="/audit-logs"
                className="text-muted-foreground hover:text-foreground text-sm underline-offset-2 hover:underline"
              >
                Audit log
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
