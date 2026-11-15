import { Section } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { CopyField } from "../../shared/CopyField";

export interface BootstrapTokensProps {
  /** The tenant the command generates for. */
  tenantId: string;
}

/**
 * General > Bootstrap tokens. Tokens are issued on the backend host on
 * purpose (no portal endpoint creates one), so this tab says how, with the
 * command ready to copy.
 */
export function BootstrapTokens({ tenantId }: BootstrapTokensProps) {
  const t = useTranslations("settings.bootstrapTokens");
  return (
    <Section
      title={t("bootstrapTokens")}
      description={t("anAgentRegistersWithA")}
    >
      <div className="grid max-w-2xl gap-3 text-sm">
        <p>{t("generateIntro")}</p>
        <CopyField
          label={t("copyTheGenerateCommand")}
          value={`python manage.py bootstrap_token generate ${tenantId} --label "production agent"`}
        />
        <p className="text-muted-foreground">
          The same command takes <code className="font-mono text-xs">list</code>{" "}
          and <code className="font-mono text-xs">revoke &lt;prefix&gt;</code>.
        </p>
      </div>
    </Section>
  );
}
