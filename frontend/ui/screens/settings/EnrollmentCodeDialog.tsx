"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DefinitionList,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import { CopyField } from "../../shared/CopyField";
import { type EnrollmentCode, useSettingsLabels } from "./model";

export interface EnrollmentCodeDialogProps {
  /** The code just generated; the dialog is open while there is one. */
  code: EnrollmentCode | null;
  /** This Zentinelle AI's address, as Astrolift asks for it. */
  zentinelleUrl: string;
  onClose: () => void;
}

/** A one-time enrollment code, with what to paste into Astrolift AI. */
export function EnrollmentCodeDialog({
  code,
  zentinelleUrl,
  onClose,
}: EnrollmentCodeDialogProps) {
  const t = useTranslations("settings.enrollmentCodeDialog");
  const { formatDate } = useSettingsLabels();
  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("enrollmentCode")}</DialogTitle>
          <DialogDescription>
            Paste this code into Astrolift AI with this Zentinelle AI&apos;s
            URL. The code works once.
          </DialogDescription>
        </DialogHeader>
        {code && (
          <div className="grid gap-3">
            <CopyField label={t("copyEnrollmentCode")} value={code.code} />
            <CopyField label={t("copyZentinelleAiUrl")} value={zentinelleUrl} />
            <DefinitionList
              items={[
                {
                  term: t("expires"),
                  description: formatDate(code.expires_at) || null,
                },
              ]}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            {t("done")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
