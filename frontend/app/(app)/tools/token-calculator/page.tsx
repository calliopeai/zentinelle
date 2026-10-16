"use client";

import { useState, useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CalculatorIcon } from "lucide-react";
import { useAIModels } from "@/graphql/models/hooks";

export default function TokenCalculatorPage() {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState("");
  const [outputRatio, setOutputRatio] = useState(1.0);

  // Prices come from the model registry, the source the backend's pricing
  // resolver reads, so this estimate matches what budgets and metering charge.
  const { models, loading } = useAIModels({ availableOnly: true });
  const priced = useMemo(
    () =>
      models.filter(
        (m) => m.inputPricePerMillion != null && m.outputPricePerMillion != null,
      ),
    [models],
  );
  const current = priced.find((m) => m.id === selected) ?? priced[0];
  const model = current?.modelId ?? "";
  const pricing = current
    ? {
        input: current.inputPricePerMillion as number,
        output: current.outputPricePerMillion as number,
        context: current.contextWindow,
      }
    : undefined;

  const tokens = useMemo(() => Math.max(1, Math.ceil(text.length / 4)), [text]);
  const outputTokens = Math.ceil(tokens * outputRatio);

  const inputCost = pricing
    ? (tokens / 1_000_000) * pricing.input
    : 0;
  const outputCost = pricing
    ? (outputTokens / 1_000_000) * pricing.output
    : 0;
  const totalCost = inputCost + outputCost;
  const contextUsage = pricing?.context
    ? ((tokens / pricing.context) * 100).toFixed(1)
    : "0";

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Token Calculator</h1>
        <p className="text-muted-foreground">
          Estimate token count and cost for any text across models
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Input Text</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={12}
                placeholder="Paste your text here to estimate token count and cost..."
                className="border-input bg-background font-mono flex w-full rounded-md border px-3 py-2 text-sm"
              />
              <div className="text-muted-foreground mt-2 flex justify-between text-xs">
                <span>{text.length} characters</span>
                <span>~{tokens.toLocaleString()} tokens</span>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-4">
            <div className="flex-1 space-y-2">
              <label className="text-sm font-medium">Model</label>
              <select
                value={current?.id ?? ""}
                onChange={(e) => setSelected(e.target.value)}
                disabled={priced.length === 0}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                {priced.length === 0 && (
                  <option value="">
                    {loading ? "Loading models..." : "No priced models in the registry"}
                  </option>
                )}
                {priced.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.providerSlug ? `${m.providerSlug}/${m.modelId}` : m.modelId}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-40 space-y-2">
              <label className="text-sm font-medium">Output Ratio</label>
              <select
                value={outputRatio}
                onChange={(e) => setOutputRatio(Number(e.target.value))}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                <option value={0.5}>0.5x (short reply)</option>
                <option value={1.0}>1x (equal length)</option>
                <option value={2.0}>2x (long reply)</option>
                <option value={4.0}>4x (very long)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold">{tokens.toLocaleString()}</div>
              <div className="text-muted-foreground text-sm">Input Tokens</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold">
                {outputTokens.toLocaleString()}
              </div>
              <div className="text-muted-foreground text-sm">
                Est. Output Tokens
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="text-4xl font-bold text-[#37efed]">
                ${totalCost.toFixed(4)}
              </div>
              <div className="text-muted-foreground text-sm">Est. Total Cost</div>
              <div className="text-muted-foreground mt-1 text-xs">
                Input: ${inputCost.toFixed(4)} · Output: ${outputCost.toFixed(4)}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm font-medium">Context Window Usage</div>
              <div className="mt-2 flex h-3 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="bg-[#37efed] transition-all"
                  style={{
                    width: `${Math.min(100, parseFloat(contextUsage))}%`,
                  }}
                />
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                {pricing?.context
                  ? `${contextUsage}% of ${pricing.context.toLocaleString()} tokens`
                  : "Context window unknown"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-sm font-medium mb-2">Pricing ({model})</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="text-muted-foreground">Input:</div>
                <div>${pricing?.input}/M tokens</div>
                <div className="text-muted-foreground">Output:</div>
                <div>${pricing?.output}/M tokens</div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
