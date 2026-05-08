"use client";

import { useState } from "react";
import { useLazyQuery, useQuery } from "@apollo/client/react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  PlayIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
} from "lucide-react";
import {
  SIMULATE_POLICY,
  type SimulatePolicyResult,
} from "@/graphql/policies/simulate";
import { GET_POLICY_OPTIONS } from "@/graphql/policies/queries";

const POLICY_TYPE_CONFIGS: Record<string, Record<string, unknown>> = {
  rate_limit: { requests_per_minute: 60, requests_per_hour: 500, tokens_per_day: 100000 },
  tool_permission: { denied_tools: ["shell", "Bash"], allowed_tools: ["web_search", "Read"] },
  model_restriction: { allowed_models: ["gpt-4o", "claude-sonnet-4-20250514"], blocked_providers: [] },
  budget_limit: { monthly_budget_usd: 500, hard_limit: true, alert_threshold_percent: 80 },
  network_policy: { allowed_domains: ["*.openai.com", "*.anthropic.com"], blocked_domains: ["*.evil.com"] },
  output_filter: { patterns: [{ name: "pii_email", pattern: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}" }] },
  safety_settings: { block_none_disabled: true, min_thresholds: { HARM_CATEGORY_HARASSMENT: "BLOCK_MEDIUM_AND_ABOVE" } },
  multimodal_policy: { allow_images: true, allow_audio: false, allow_video: false, max_media_bytes: 10485760 },
};

export default function PolicySimulatorPage() {
  const [policyType, setPolicyType] = useState("rate_limit");
  const [enforcement, setEnforcement] = useState("enforce");
  const [lookbackDays, setLookbackDays] = useState(7);
  const [config, setConfig] = useState(
    JSON.stringify(POLICY_TYPE_CONFIGS["rate_limit"], null, 2),
  );
  const [result, setResult] = useState<SimulatePolicyResult["simulatePolicy"] | null>(null);

  // Pre-fetch policy options for future use (e.g. dynamic policy type list)
  useQuery(GET_POLICY_OPTIONS);

  const [executeSimulation, { loading: running }] = useLazyQuery<SimulatePolicyResult>(
    SIMULATE_POLICY,
    { fetchPolicy: "network-only" },
  );

  const runSimulation = async () => {
    let parsedConfig: Record<string, unknown>;
    try {
      parsedConfig = JSON.parse(config);
    } catch {
      toast.error("Invalid JSON configuration", {
        description: "Please fix the JSON syntax and try again.",
      });
      return;
    }

    setResult(null);
    try {
      const { data } = await executeSimulation({
        variables: {
          policyType,
          config: parsedConfig,
          enforcement,
          lookbackDays,
        },
      });
      if (data?.simulatePolicy) {
        setResult(data.simulatePolicy);
      } else {
        toast.error("Simulation returned no results");
      }
    } catch (err: unknown) {
      toast.error("Simulation failed", {
        description: err instanceof Error ? err.message : "An unexpected error occurred.",
      });
    }
  };

  const totalEvents = result?.totalEvents ?? 0;
  const wouldAllow = result?.wouldPass ?? 0;
  const wouldWarn = result?.wouldWarn ?? 0;
  const wouldBlock = result?.wouldBlock ?? 0;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Policy Simulator</h1>
        <p className="text-muted-foreground">
          Test how a policy would behave against your recent agent activity
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5" />
              Policy Configuration
            </CardTitle>
            <CardDescription>
              Configure a policy to simulate against the last {lookbackDays} days
              of activity
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Policy Type</label>
              <select
                value={policyType}
                onChange={(e) => {
                  setPolicyType(e.target.value);
                  setConfig(
                    JSON.stringify(
                      POLICY_TYPE_CONFIGS[e.target.value] || {},
                      null,
                      2,
                    ),
                  );
                }}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.keys(POLICY_TYPE_CONFIGS).map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Enforcement</label>
              <select
                value={enforcement}
                onChange={(e) => setEnforcement(e.target.value)}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value="enforce">Enforce (block violations)</option>
                <option value="audit">Audit (log only)</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Lookback Period</label>
              <select
                value={lookbackDays}
                onChange={(e) => setLookbackDays(Number(e.target.value))}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value={1}>Last 24 hours</option>
                <option value={7}>Last 7 days</option>
                <option value={30}>Last 30 days</option>
                <option value={90}>Last 90 days</option>
              </select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Configuration (JSON)</label>
              <textarea
                value={config}
                onChange={(e) => setConfig(e.target.value)}
                rows={10}
                className="border-input bg-background font-mono flex w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>

            <Button onClick={runSimulation} disabled={running} className="w-full">
              <PlayIcon className="mr-2 h-4 w-4" />
              {running ? "Simulating..." : "Run Simulation"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <div className="space-y-4">
          {result ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Simulation Results</CardTitle>
                  <CardDescription>
                    Impact on {totalEvents} events from the last{" "}
                    {result.lookbackDays} days
                    {result.impactPercent > 0 && (
                      <span className="ml-1">
                        ({result.impactPercent.toFixed(1)}% impact)
                      </span>
                    )}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg border p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-green-500">
                        <CheckCircleIcon className="h-5 w-5" />
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {wouldAllow}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Would Allow
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-yellow-500">
                        <AlertTriangleIcon className="h-5 w-5" />
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {wouldWarn}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Would Warn
                      </div>
                    </div>
                    <div className="rounded-lg border p-4 text-center">
                      <div className="flex items-center justify-center gap-1 text-red-500">
                        <ShieldXIcon className="h-5 w-5" />
                      </div>
                      <div className="mt-2 text-2xl font-bold">
                        {wouldBlock}
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Would Block
                      </div>
                    </div>
                  </div>

                  {/* Impact bar */}
                  {totalEvents > 0 && (
                    <div className="mt-4">
                      <div className="text-muted-foreground mb-1 text-xs">
                        Impact Distribution
                      </div>
                      <div className="flex h-4 w-full overflow-hidden rounded-full">
                        <div
                          className="bg-green-500"
                          style={{
                            width: `${(wouldAllow / totalEvents) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-yellow-500"
                          style={{
                            width: `${(wouldWarn / totalEvents) * 100}%`,
                          }}
                        />
                        <div
                          className="bg-red-500"
                          style={{
                            width: `${(wouldBlock / totalEvents) * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {result.blockedSamples.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Sample Blocked Events</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {result.blockedSamples.map((s, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-sm"
                        >
                          <ShieldXIcon className="h-4 w-4 shrink-0 text-red-500" />
                          <code className="bg-muted rounded px-2 py-1 text-xs">
                            {s}
                          </code>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {result.simulatedPolicyType && (
                <div className="text-muted-foreground text-xs">
                  Simulated policy type: <Badge variant="outline" className="ml-1 text-xs">{result.simulatedPolicyType}</Badge>
                </div>
              )}
            </>
          ) : (
            <Card className="flex min-h-[400px] items-center justify-center">
              <CardContent className="text-center">
                <PlayIcon className="text-muted-foreground mx-auto h-12 w-12" />
                <p className="text-muted-foreground mt-4">
                  {running
                    ? "Running simulation against historical events..."
                    : "Configure a policy and run the simulation to see its impact"}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
