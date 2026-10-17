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
          <DialogTitle>Apply a compliance pack</DialogTitle>
          <DialogDescription>
            A pack creates or updates the policies a framework expects. Review
            them in Policies before they enforce.
          </DialogDescription>
        </DialogHeader>
        {failure && (
          <ErrorState title="Could not apply the pack" error={failure} />
        )}
        <List
          label="Compliance packs"
          items={packs}
          getKey={(pack) => pack.name}
          loading={loading}
          error={error}
          onRetry={onRetry}
          empty={{
            title: "No packs available",
            description: "This installation ships no compliance packs.",
          }}
          renderItem={(pack) => (
            <ListItem
              title={pack.displayName ?? pack.name}
              description={pack.description}
              meta={
                <span className="font-mono text-xs">
                  {pack.version ? `v${pack.version}` : null}
                  {pack.policyCount != null &&
                    ` · ${pack.policyCount} policies`}
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
                  {pending === pack.name ? "Applying" : "Apply"}
                </Button>
              }
            />
          )}
        />
      </DialogContent>
    </Dialog>
  );
}
