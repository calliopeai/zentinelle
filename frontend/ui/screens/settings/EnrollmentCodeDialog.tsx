"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@calliopelabs/ui";

import { CopyField } from "../../shared/CopyField";
import { DefinitionList } from "./components/DefinitionList";
import { formatDate, type EnrollmentCode } from "./model";

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
  return (
    <Dialog open={code !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Enrollment code</DialogTitle>
          <DialogDescription>
            Paste this code into Astrolift AI with this Zentinelle AI&apos;s
            URL. The code works once.
          </DialogDescription>
        </DialogHeader>
        {code && (
          <div className="grid gap-3">
            <CopyField label="Copy enrollment code" value={code.code} />
            <CopyField label="Copy Zentinelle AI URL" value={zentinelleUrl} />
            <DefinitionList
              items={[{ term: "Expires", value: formatDate(code.expires_at) }]}
            />
          </div>
        )}
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
