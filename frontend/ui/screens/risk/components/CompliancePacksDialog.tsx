import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  ErrorState,
  List,
  ListItem,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { QueryState } from "../model";

/** A pack as `ListCompliancePacks` returns it. */
export interface CompliancePack {
  name: string;
  displayName: string | null;
  version: string | null;
  description: string | null;
  policyCount: number | null;
}

export interface CompliancePacksDialogProps extends QueryState {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packs: readonly CompliancePack[];
  /** `ActivateCompliancePack`; resolves with an error message, or nothing on success. */
  onActivate: (pack: CompliancePack) => Promise<string | void>;
}

/**
 * Apply a compliance pack: a curated set of policies for a framework. The
 * policies it creates are configuration; they count as coverage here and
 * prove nothing about operation until Evidence says so.
 */
export function CompliancePacksDialog({
  open,
  onOpenChange,
  packs,
  onActivate,
  loading,
  error,
  onRetry,
}: CompliancePacksDialogProps) {
  const t = useTranslations("risk.compliancePacksDialog");
  const [pending, setPending] = React.useState<string | null>(null);
  const [failure, setFailure] = React.useState<string | null>(null);
  async function activate(pack: CompliancePack) {
    setPending(pack.name);
    setFailure(null);
    try {
      const message = await onActivate(pack);
      if (message) setFailure(message);
    } catch (reason) {
      setFailure(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setPending(null);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("applyPack")}</DialogTitle>
          <DialogDescription>{t("aPackCreatesOrUpdates")}</DialogDescription>
        </DialogHeader>
        {failure && (
          <ErrorState title={t("couldNotApplyThePack")} error={failure} />
        )}
        <List
          label={t("compliancePacks")}
          items={packs}
          getKey={(pack) => pack.name}
          loading={loading}
          error={error}
          onRetry={onRetry}
          empty={{
            title: t("noPacksAvailable"),
            description: t("thisInstallationShipsNoCompliance"),
          }}
          renderItem={(pack) => (
            <ListItem
              title={pack.displayName ?? pack.name}
              description={pack.description}
              meta={
                <span className="font-mono text-xs">
                  {pack.version ? `v${pack.version}` : null}
                  {pack.policyCount != null &&
                    ` · ${t("policies", { count: pack.policyCount })}`}
                </span>
              }
              actions={
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending !== null}
                  onClick={() => void activate(pack)}
                  aria-label={`Apply ${pack.displayName ?? pack.name}`}
                >
                  {pending === pack.name ? t("applying") : t("apply")}
                </Button>
              }
            />
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
