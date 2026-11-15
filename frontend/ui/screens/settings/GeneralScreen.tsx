import { PageFrame, type TabNavItem } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

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

/** General's tabs, named under `settings.generalScreen.tabs`. */
export const GENERAL_TABS = [
  { key: "organization" },
  { key: "enforcement" },
  { key: "notifications" },
  { key: "runtime" },
  { key: "bootstrap" },
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

function tabs(active: GeneralTab, t: (key: string) => string): TabNavItem[] {
  return GENERAL_TABS.map((tab) => ({
    key: tab.key,
    label: t(`tabs.${tab.key}`),
    href: tab.key === "organization" ? "/settings" : `/settings?tab=${tab.key}`,
    active: tab.key === active,
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
  const t = useTranslations("settings.generalScreen");
  return (
    <PageFrame
      crumbs={settingsCrumbs("general")}
      title={t("general")}
      tabs={tabs(tab, t)}
      tabsLabel={t("generalSettings")}
    >
      {tab === "runtime" ? (
        <Loaded label={t("runtimeSettings")} value={runtime}>
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
        <Loaded label={t("organizationSettings")} value={organization}>
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
