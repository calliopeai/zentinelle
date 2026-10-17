import { List, ListItem, StatusBadge } from "@calliopelabs/ui";
import { CircleCheckIcon, CircleIcon } from "lucide-react";

import type { OnboardingStep } from "./overview-model";

export interface OnboardingCardProps {
  steps: readonly OnboardingStep[];
  /** Viewers see the steps but cannot take them: no links. */
  canMutate: boolean;
}

/** The steps left to set Zentinelle AI up, until all are done. */
export function OnboardingCard({ steps, canMutate }: OnboardingCardProps) {
  const done = steps.filter((s) => s.done).length;
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground text-sm">
        {done} of {steps.length} done
        {canMutate ? "" : ". An operator or admin can take the rest."}
      </p>
      <List
        label="Setup steps"
        items={steps}
        getKey={(step) => step.key}
        empty={{ title: "Nothing left to set up" }}
        renderItem={(step) => (
          <ListItem
            title={step.label}
            href={canMutate && !step.done ? step.href : undefined}
            icon={step.done ? <CircleCheckIcon /> : <CircleIcon />}
            status={
              <StatusBadge tone={step.done ? "ok" : "muted"}>
                {step.done ? "done" : "to do"}
              </StatusBadge>
            }
          />
        )}
      />
    </div>
  );
}
