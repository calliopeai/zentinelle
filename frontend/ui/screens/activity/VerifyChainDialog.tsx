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

import { DefinitionList } from "../../shared/DefinitionList";
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Audit chain</DialogTitle>
          <DialogDescription>
            Every record carries the hash of the one before it. A break means a
            record was changed or removed after it was written.
          </DialogDescription>
        </DialogHeader>
        {verifying ? (
          <LoadingState label="Verifying the audit chain" rows={3} />
        ) : error ? (
          <ErrorState
            title="Could not verify the chain"
            error={error}
            onRetry={onRetry}
          />
        ) : result ? (
          <div className="flex flex-col gap-3">
            <StatusBadge
              tone={result.valid ? "ok" : "error"}
              className="self-start"
            >
              {result.valid ? "intact" : "broken"}
            </StatusBadge>
            <DefinitionList
              columns={1}
              items={[
                {
                  term: "Records checked",
                  value: result.records_checked.toLocaleString("en"),
                },
                ...(result.unverifiable_records
                  ? [
                      {
                        term: "Written before hashing",
                        value: result.unverifiable_records.toLocaleString("en"),
                      },
                    ]
                  : []),
                ...(result.broken_at_sequence !== null
                  ? [
                      {
                        term: "Broken at sequence",
                        value: result.broken_at_sequence,
                        mono: true,
                      },
                    ]
                  : []),
                { term: "Root hash", value: result.root_hash, mono: true },
                ...(result.expected_hash
                  ? [
                      {
                        term: "Expected hash",
                        value: result.expected_hash,
                        mono: true,
                      },
                    ]
                  : []),
                ...(result.actual_hash
                  ? [
                      {
                        term: "Actual hash",
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
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
