import { List, ListItem, StatusBadge } from "@calliopelabs/ui";
import { CircleCheckIcon, CircleIcon } from "lucide-react";
import { useTranslations } from "next-intl";

import type { OnboardingStep } from "./overview-model";

export interface OnboardingCardProps {
  steps: readonly OnboardingStep[];
  /** Viewers see the steps but cannot take them: no links. */
  canMutate: boolean;
}

/** The steps left to set Zentinelle AI up, until all are done. */
export function OnboardingCard({ steps, canMutate }: OnboardingCardProps) {
  const t = useTranslations("overview.onboarding");
  const done = steps.filter((s) => s.done).length;
  const progress = { done, total: steps.length };
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        {canMutate ? t("progress", progress) : t("progressViewer", progress)}
      </p>
      <List
        label={t("label")}
        items={steps}
        getKey={(step) => step.key}
        empty={{ title: t("empty") }}
        renderItem={(step) => (
          <ListItem
            title={step.known ? t(`steps.${step.key}`) : step.label}
            href={canMutate && !step.done ? step.href : undefined}
            icon={step.done ? <CircleCheckIcon /> : <CircleIcon />}
            status={
              <StatusBadge tone={step.done ? "ok" : "muted"}>
                {step.done ? t("done") : t("toDo")}
              </StatusBadge>
            }
          />
        )}
      />
    </div>
  );
}
