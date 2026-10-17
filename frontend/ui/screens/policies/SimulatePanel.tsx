import {
  Button,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  ErrorState,
  LoadingState,
} from "@calliopelabs/ui";
import * as React from "react";

import type { SimulatePolicyResult } from "@/graphql/policies/simulate";

import { Field } from "../../shared/Field";
import { Select, type SelectOption } from "../../shared/Select";
import { StatTile } from "./components/StatTile";
import { Textarea } from "../../shared/Textarea";

export type Simulation = SimulatePolicyResult["simulatePolicy"];

/** `SimulatePolicy`'s variables. */
export interface SimulateInput {
  policyType: string;
  config: Record<string, unknown>;
  enforcement: string;
  lookbackDays: number;
}

export interface SimulatePanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Policy types from `GetPolicyOptions`. */
  types: readonly SelectOption[];
  /** Prefilled from a policy when opened from its detail page. */
  initial?: Partial<SimulateInput>;
  onRun: (input: SimulateInput) => void;
  result: Simulation | null;
  running: boolean;
  error?: { message: string } | null;
}

const LOOKBACK: readonly SelectOption[] = [
  { value: "1", label: "Last 24 hours" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
];

const ENFORCEMENT: readonly SelectOption[] = [
  { value: "enforce", label: "Enforce" },
  { value: "audit", label: "Audit only" },
];

function percent(part: number, total: number) {
  return total ? `${((part / total) * 100).toFixed(1)}%` : "0%";
}

/** Simulate: replay a policy over recent events, before it reaches an agent. A query, so every role may run it. */
export function SimulatePanel({
  open,
  onOpenChange,
  types,
  initial,
  onRun,
  result,
  running,
  error,
}: SimulatePanelProps) {
  const [policyType, setPolicyType] = React.useState(
    initial?.policyType ?? types[0]?.value ?? "",
  );
  const [config, setConfig] = React.useState(
    JSON.stringify(initial?.config ?? {}, null, 2),
  );
  const [enforcement, setEnforcement] = React.useState(
    initial?.enforcement ?? "enforce",
  );
  const [lookback, setLookback] = React.useState(
    String(initial?.lookbackDays ?? 7),
  );
  const [configError, setConfigError] = React.useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    let parsed: unknown;
    try {
      parsed = JSON.parse(config || "{}");
    } catch {
      setConfigError("The configuration is not valid JSON.");
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setConfigError("The configuration must be a JSON object.");
      return;
    }
    setConfigError(null);
    onRun({
      policyType,
      config: parsed as Record<string, unknown>,
      enforcement,
      lookbackDays: Number(lookback),
    });
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="sm:max-w-lg">
        <DrawerHeader>
          <DrawerTitle>Simulate a policy</DrawerTitle>
          <DrawerDescription>
            Replays recent events against the policy. Nothing is enforced and no
            agent is affected.
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label="Policy type">
              {(c) => (
                <Select
                  {...c}
                  options={types}
                  value={policyType}
                  onValueChange={setPolicyType}
                />
              )}
            </Field>
            <Field
              label="Configuration"
              hint="JSON, as the policy stores it."
              error={configError}
            >
              {(c) => (
                <Textarea
                  {...c}
                  mono
                  rows={6}
                  value={config}
                  onChange={(e) => setConfig(e.target.value)}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Mode">
                {(c) => (
                  <Select
                    {...c}
                    options={ENFORCEMENT}
                    value={enforcement}
                    onValueChange={setEnforcement}
                  />
                )}
              </Field>
              <Field label="Window">
                {(c) => (
                  <Select
                    {...c}
                    options={LOOKBACK}
                    value={lookback}
                    onValueChange={setLookback}
                  />
                )}
              </Field>
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={running || !policyType}
              className="self-start"
            >
              {running ? "Simulating" : "Run simulation"}
            </Button>
          </form>
          <section
            aria-label="Simulation result"
            aria-live="polite"
            className="flex flex-col gap-3"
          >
            {error ? (
              <ErrorState title="The simulation failed" error={error} />
            ) : running ? (
              <LoadingState label="Simulating" rows={3} />
            ) : result ? (
              result.totalEvents === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No events in the last {result.lookbackDays} days to replay.
                  Widen the window, or simulate again once agents have run.
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    Over {result.totalEvents.toLocaleString()} events in the
                    last {result.lookbackDays} days, this policy would have
                    changed the outcome of{" "}
                    <strong>{result.impactPercent}%</strong>.
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile
                      label="Would block"
                      value={result.wouldBlock.toLocaleString()}
                      hint={percent(result.wouldBlock, result.totalEvents)}
                      tone={result.wouldBlock ? "error" : undefined}
                    />
                    <StatTile
                      label="Would warn"
                      value={result.wouldWarn.toLocaleString()}
                      hint={percent(result.wouldWarn, result.totalEvents)}
                      tone={result.wouldWarn ? "warn" : undefined}
                    />
                    <StatTile
                      label="Would pass"
                      value={result.wouldPass.toLocaleString()}
                      hint={percent(result.wouldPass, result.totalEvents)}
                    />
                    <StatTile
                      label="Inconclusive"
                      value={result.inconclusive.toLocaleString()}
                      hint="the event lacked the fields to decide"
                    />
                  </div>
                  {result.blockedSamples.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-sm font-semibold">
                        Sample of blocked events
                      </h3>
                      <ul className="flex flex-col gap-1">
                        {result.blockedSamples.map((s) => (
                          <li
                            key={s}
                            className="rounded bg-muted px-2 py-1 font-mono text-xs [overflow-wrap:anywhere]"
                          >
                            {s}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </>
              )
            ) : null}
          </section>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
