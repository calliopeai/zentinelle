import { PageFrame } from "@calliopelabs/ui";

import { ForbiddenState } from "../../shared/ForbiddenState";

export interface SettingsForbiddenScreenProps {
  /** The function's own title, so a deep link still says where it landed. */
  title: string;
}

/** Any Settings route opened without the admin role: a clean 403 (ui-overhaul-ia §4.3, §6 step 8). */
export function SettingsForbiddenScreen({
  title,
}: SettingsForbiddenScreenProps) {
  return (
    <PageFrame title={title}>
      <ForbiddenState
        title="Settings need the admin role"
        description="Organization settings, API keys, integrations, data retention and the assistant are open to admins only. Ask an admin in your organization for access."
      />
    </PageFrame>
  );
}
