import { PageFrame } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { AssistantForm } from "./AssistantForm";
import { Loaded } from "./Loaded";
import {
  settingsCrumbs,
  type Loadable,
  type RuntimeActions,
  type RuntimeSnapshot,
} from "./model";
import { RevisionHistory } from "./RevisionHistory";
import { StagedChanges } from "./StagedChanges";

export interface AssistantScreenProps {
  /** GET settings/runtime. */
  runtime: Loadable<RuntimeSnapshot>;
  actions: RuntimeActions;
}

/** Settings > Assistant (`/settings/assistant`, new): the assistant's model and scope, staged like every runtime change. */
export function AssistantScreen({ runtime, actions }: AssistantScreenProps) {
  const t = useTranslations("settings.assistantScreen");
  return (
    <PageFrame
      crumbs={settingsCrumbs("assistant")}
      title={t("assistant")}
      description={t("theAssistantDocksOnThe")}
    >
      <Loaded label={t("assistantSettings")} value={runtime}>
        {(snapshot) => (
          <>
            <AssistantForm
              key={snapshot.revision}
              snapshot={snapshot}
              onStage={actions.onStage}
            />
            {snapshot.pending.length > 0 && (
              <StagedChanges
                changes={snapshot.pending}
                onTransition={actions.onTransition}
              />
            )}
            <RevisionHistory
              revisions={snapshot.revisions}
              current={snapshot.revision}
              onRollback={actions.onRollback}
            />
          </>
        )}
      </Loaded>
    </PageFrame>
  );
}
