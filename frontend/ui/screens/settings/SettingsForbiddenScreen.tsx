import { PageFrame } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { ForbiddenState } from "../../shared/ForbiddenState";

export interface SettingsForbiddenScreenProps {
  /** The function's own title, so a deep link still says where it landed. */
  title: string;
}

/** Any Settings route opened without the admin role: a clean 403 (ui-overhaul-ia §4.3, §6 step 8). */
export function SettingsForbiddenScreen({
  title,
}: SettingsForbiddenScreenProps) {
  const t = useTranslations("settings.settingsForbiddenScreen");
  return (
    <PageFrame title={title}>
      <ForbiddenState
        title={t("settingsNeedTheAdminRole")}
        description={t("organizationSettingsApiKeysIntegrations")}
      />
    </PageFrame>
  );
}
