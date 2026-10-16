import { PageFrame, type TabNavItem } from "@calliopelabs/ui";

import { BootstrapTokens } from "./BootstrapTokens";
import { EnforcementForm } from "./EnforcementForm";
import { Loaded } from "./Loaded";
import {
  settingsCrumbs,
  type Loadable,
  type Organization,
  type OrganizationUpdate,
  type RuntimeActions,
  type RuntimeSnapshot,
  type Save,
} from "./model";
import { NotificationsForm } from "./NotificationsForm";
import { OrganizationForm } from "./OrganizationForm";
import { RevisionHistory } from "./RevisionHistory";
import { RuntimeForm } from "./RuntimeForm";
import { StagedChanges } from "./StagedChanges";

export const GENERAL_TABS = [
  { key: "organization", label: "Organization" },
  { key: "enforcement", label: "Enforcement" },
  { key: "notifications", label: "Notifications" },
  { key: "runtime", label: "Runtime" },
  { key: "bootstrap", label: "Bootstrap tokens" },
] as const;

export type GeneralTab = (typeof GENERAL_TABS)[number]["key"];

export interface GeneralScreenProps {
  tab: GeneralTab;
  /** GetMyOrganization; read on Organization, Enforcement, Notifications and Bootstrap tokens. */
  organization: Loadable<Organization>;
  onSaveOrganization: Save<OrganizationUpdate>;
  /** GET settings/runtime; read on Runtime only. */
  runtime: Loadable<RuntimeSnapshot>;
  runtimeActions: RuntimeActions;
}

function tabs(active: GeneralTab): TabNavItem[] {
  return GENERAL_TABS.map((t) => ({
    key: t.key,
    label: t.label,
    href: t.key === "organization" ? "/settings" : `/settings?tab=${t.key}`,
    active: t.key === active,
  }));
}

/**
 * Settings > General (`/settings`), the old 900-line settings page split
 * into five tabs. Each tab reads only its own query; the route fetches what
 * the active tab shows. Language and appearance moved to the user menu.
 */
export function GeneralScreen({
  tab,
  organization,
  onSaveOrganization,
  runtime,
  runtimeActions,
}: GeneralScreenProps) {
  return (
    <PageFrame
      crumbs={settingsCrumbs("general")}
      title="General"
      tabs={tabs(tab)}
      tabsLabel="General settings"
    >
      {tab === "runtime" ? (
        <Loaded label="runtime settings" value={runtime}>
          {(snapshot) => (
            <>
              <RuntimeForm
                key={snapshot.revision}
                snapshot={snapshot}
                onStage={runtimeActions.onStage}
              />
              {snapshot.pending.length > 0 && (
                <StagedChanges
                  changes={snapshot.pending}
                  onTransition={runtimeActions.onTransition}
                />
              )}
              <RevisionHistory
                revisions={snapshot.revisions}
                current={snapshot.revision}
                onRollback={runtimeActions.onRollback}
              />
            </>
          )}
        </Loaded>
      ) : (
        <Loaded label="organization settings" value={organization}>
          {(org) =>
            tab === "organization" ? (
              <OrganizationForm
                organization={org}
                onSave={onSaveOrganization}
              />
            ) : tab === "enforcement" ? (
              <EnforcementForm organization={org} onSave={onSaveOrganization} />
            ) : tab === "notifications" ? (
              <NotificationsForm
                organization={org}
                onSave={onSaveOrganization}
              />
            ) : (
              <BootstrapTokens tenantId={org.id ?? "<tenant_id>"} />
            )
          }
        </Loaded>
      )}
    </PageFrame>
  );
}
