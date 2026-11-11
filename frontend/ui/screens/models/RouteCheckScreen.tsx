"use client";

import {
  Button,
  DataTable,
  Input,
  PageFrame,
  Section,
  StatusBadge,
  type Column,
  type StatusTone,
} from "@calliopelabs/ui";
import { RouteIcon } from "lucide-react";
import * as React from "react";

import { AccessDenied } from "../../shared/AccessDenied";
import { Panel } from "../../shared/Panel";
import { formatMoment } from "../../shared/figures";
import { fixedList } from "../../shared/table";
import { areaCrumbs, can, modelsTabs } from "./frame";
import type { CanaryResult } from "./providers";

const STATUS: Record<string, { tone: StatusTone; label: string }> = {
  passed: { tone: "ok", label: "allowed" },
  failed: { tone: "error", label: "denied" },
  rolled_back: { tone: "muted", label: "rolled back" },
};

export interface RouteCheckScreenProps {
  capabilities: readonly string[];
  /** `GET /models/route-canary`, newest first. */
  results: readonly CanaryResult[];
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** `POST /models/route-canary`. */
  onRun: (route: { provider: string; model: string }) => void;
  running?: boolean;
  runError?: string | null;
  /** `POST /models/route-canary/{id}/rollback`. */
  onRollback: (id: string) => void;
  locale?: string;
}

/**
 * Models > Route check (`/models/routes`, formerly `/models/route-canary`,
 * admin): ask whether policy would let traffic reach a provider and model,
 * before any does. A check sends nothing to the provider.
 */
export function RouteCheckScreen({
  capabilities,
  results,
  loading,
  error,
  onRetry,
  onRun,
  running,
  runError,
  onRollback,
  locale = "en",
}: RouteCheckScreenProps) {
  const [provider, setProvider] = React.useState("");
  const [model, setModel] = React.useState("");
  const providerId = React.useId();
  const modelId = React.useId();
  const admin = can(capabilities, "admin");

  const columns: Column<CanaryResult>[] = [
    {
      id: "route",
      header: "Provider and model",
      cell: (r) => (
        <span className="font-mono text-xs [overflow-wrap:anywhere]">
          {r.provider}/{r.model}
        </span>
      ),
    },
    {
      id: "status",
      header: "Result",
      width: "w-32",
      cell: (r) => (
        <StatusBadge
          tone={STATUS[r.status]?.tone ?? "muted"}
          struck={r.status === "rolled_back"}
        >
          {STATUS[r.status]?.label ?? r.status}
        </StatusBadge>
      ),
    },
    {
      id: "reason",
      header: "Reason",
      cell: (r) => (
        <span className="text-sm [overflow-wrap:anywhere]">{r.reason}</span>
      ),
    },
    {
      id: "when",
      header: "When",
      width: "w-40",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {formatMoment(r.created_at, locale)}
        </span>
      ),
    },
    {
      id: "control",
      header: <span className="sr-only">Control</span>,
      label: "Control",
      width: "w-28",
      align: "right",
      cell: (r) =>
        r.status === "rolled_back" ? null : (
          <Button
            size="xs"
            variant="outline"
            onClick={() => onRollback(r.id)}
            aria-label={`Roll back ${r.provider}/${r.model}`}
          >
            Roll back
          </Button>
        ),
    },
  ];

  return (
    <PageFrame
      crumbs={areaCrumbs(capabilities, "models")}
      title="Models"
      description="Check that policy allows a provider and model before any traffic is sent. A check has no side effects at the provider."
      tabs={modelsTabs("routes", capabilities)}
      tabsLabel="Models tabs"
    >
      {!admin ? (
        <AccessDenied
          what="Route check"
          role="admin"
          homeHref="/models"
          homeLabel="Back to Models"
        />
      ) : (
        <>
          <Section title="Run a check">
            <Panel>
              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  onRun({ provider: provider.trim(), model: model.trim() });
                }}
              >
                <div className="flex min-w-40 flex-col gap-1.5">
                  <label htmlFor={providerId} className="text-sm font-medium">
                    Provider
                  </label>
                  <Input
                    id={providerId}
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                    placeholder="anthropic"
                    required
                  />
                </div>
                <div className="flex min-w-56 flex-1 flex-col gap-1.5">
                  <label htmlFor={modelId} className="text-sm font-medium">
                    Model id
                  </label>
                  <Input
                    id={modelId}
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder="claude-sonnet-4-5"
                    required
                  />
                </div>
                <Button type="submit" size="sm" disabled={running}>
                  {running ? "Checking" : "Run check"}
                </Button>
              </form>
              {runError && (
                <p role="alert" className="text-sm text-danger-fg">
                  {runError}
                </p>
              )}
            </Panel>
          </Section>
          <Section title="Recent checks">
            <DataTable
              label="Recent route checks"
              chrome="table"
              controller={fixedList({ rows: results, loading, error, onRetry })}
              columns={columns}
              getRowId={(r) => r.id}
              empty={{
                icon: <RouteIcon />,
                title: "No route checks yet",
                description:
                  "Run one above before routing an agent to a new provider or model.",
              }}
            />
          </Section>
        </>
      )}
    </PageFrame>
  );
}
