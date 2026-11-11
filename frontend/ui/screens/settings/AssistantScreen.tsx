import { PageFrame } from "@calliopelabs/ui";

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
  return (
    <PageFrame
      crumbs={settingsCrumbs("assistant")}
      title="Assistant"
      description="The assistant docks on the right of every page. It reads what the person asking may read, and every change it drafts waits for approval."
    >
      <Loaded label="assistant settings" value={runtime}>
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
