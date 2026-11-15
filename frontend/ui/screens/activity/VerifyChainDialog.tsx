import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  ErrorState,
  LoadingState,
  StatusBadge,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { DefinitionList } from "./components/DefinitionList";
import type { AuditChainVerification } from "./types";

export interface VerifyChainDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** REST `audit/verify` in flight. */
  verifying: boolean;
  result: AuditChainVerification | null;
  error?: { message: string } | null;
  onRetry?: () => void;
}

/** The answer to "has anyone altered the audit log": the hash chain checked end to end. */
export function VerifyChainDialog({
  open,
  onOpenChange,
  verifying,
  result,
  error,
  onRetry,
}: VerifyChainDialogProps) {
  const t = useTranslations("activity.audit.verifyDialog");
  const c = useTranslations("common");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {verifying ? (
          <LoadingState label={t("loading")} rows={3} />
        ) : error ? (
          <ErrorState title={t("error")} error={error} onRetry={onRetry} />
        ) : result ? (
          <div className="flex flex-col gap-3">
            <StatusBadge
              tone={result.valid ? "ok" : "error"}
              className="self-start"
            >
              {result.valid ? t("intact") : t("broken")}
            </StatusBadge>
            <DefinitionList
              columns={1}
              items={[
                {
                  term: t("checked"),
                  value: result.records_checked.toLocaleString("en"),
                },
                ...(result.unverifiable_records
                  ? [
                      {
                        term: t("unverifiable"),
                        value: result.unverifiable_records.toLocaleString("en"),
                      },
                    ]
                  : []),
                ...(result.broken_at_sequence !== null
                  ? [
                      {
                        term: t("brokenAt"),
                        value: result.broken_at_sequence,
                        mono: true,
                      },
                    ]
                  : []),
                { term: t("root"), value: result.root_hash, mono: true },
                ...(result.expected_hash
                  ? [
                      {
                        term: t("expected"),
                        value: result.expected_hash,
                        mono: true,
                      },
                    ]
                  : []),
                ...(result.actual_hash
                  ? [
                      {
                        term: t("actual"),
                        value: result.actual_hash,
                        mono: true,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {c("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
