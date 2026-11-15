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
import { useTranslations } from "next-intl";

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

const lookbackOptions = (
  t: (key: string) => string,
): readonly SelectOption[] => [
  { value: "1", label: t("last24Hours") },
  { value: "7", label: t("last7Days") },
  { value: "30", label: t("last30Days") },
];

const enforcementOptions = (
  t: (key: string) => string,
): readonly SelectOption[] => [
  { value: "enforce", label: t("enforce") },
  { value: "audit", label: t("auditOnly") },
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
  const t = useTranslations("policies.simulatePanel");
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
      setConfigError(t("theConfigurationIsNotValid"));
      return;
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      setConfigError(t("theConfigurationMustBeA"));
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
          <DrawerTitle>{t("simulateAPolicy")}</DrawerTitle>
          <DrawerDescription>
            {t("replaysRecentEventsAgainstThe")}
          </DrawerDescription>
        </DrawerHeader>
        <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-4">
          <form onSubmit={submit} className="flex flex-col gap-3">
            <Field label={t("policyType")}>
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
              label={t("configuration")}
              hint={t("jsonAsThePolicyStores")}
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
              <Field label={t("mode")}>
                {(c) => (
                  <Select
                    {...c}
                    options={enforcementOptions(t)}
                    value={enforcement}
                    onValueChange={setEnforcement}
                  />
                )}
              </Field>
              <Field label={t("window")}>
                {(c) => (
                  <Select
                    {...c}
                    options={lookbackOptions(t)}
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
              {running ? t("simulating") : t("runSimulation")}
            </Button>
          </form>
          <section
            aria-label={t("simulationResult")}
            aria-live="polite"
            className="flex flex-col gap-3"
          >
            {error ? (
              <ErrorState title={t("theSimulationFailed")} error={error} />
            ) : running ? (
              <LoadingState label={t("simulating")} rows={3} />
            ) : result ? (
              result.totalEvents === 0 ? (
                <p className="text-sm text-muted-foreground">
                  {t("noEvents", { days: result.lookbackDays })}
                </p>
              ) : (
                <>
                  <p className="text-sm">
                    {t.rich("outcome", {
                      events: result.totalEvents.toLocaleString(),
                      days: result.lookbackDays,
                      percent: result.impactPercent,
                      strong: (chunks) => <strong>{chunks}</strong>,
                    })}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <StatTile
                      label={t("wouldBlock")}
                      value={result.wouldBlock.toLocaleString()}
                      hint={percent(result.wouldBlock, result.totalEvents)}
                      tone={result.wouldBlock ? "error" : undefined}
                    />
                    <StatTile
                      label={t("wouldWarn")}
                      value={result.wouldWarn.toLocaleString()}
                      hint={percent(result.wouldWarn, result.totalEvents)}
                      tone={result.wouldWarn ? "warn" : undefined}
                    />
                    <StatTile
                      label={t("wouldPass")}
                      value={result.wouldPass.toLocaleString()}
                      hint={percent(result.wouldPass, result.totalEvents)}
                    />
                    <StatTile
                      label={t("inconclusive")}
                      value={result.inconclusive.toLocaleString()}
                      hint={t("theEventLackedTheFields")}
                    />
                  </div>
                  {result.blockedSamples.length > 0 && (
                    <div>
                      <h3 className="mb-1 text-sm font-semibold">
                        {t("sampleOfBlockedEvents")}
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
