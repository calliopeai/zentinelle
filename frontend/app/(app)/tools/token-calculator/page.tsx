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

const MODEL_PRICING: Record<
  string,
  { input: number; output: number; context: number }
> = {
  "gpt-4o": { input: 2.5, output: 10.0, context: 128000 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, context: 128000 },
  "o1": { input: 15.0, output: 60.0, context: 200000 },
  "o3-mini": { input: 1.1, output: 4.4, context: 200000 },
  "claude-opus-4": { input: 15.0, output: 75.0, context: 200000 },
  "claude-sonnet-4": { input: 3.0, output: 15.0, context: 200000 },
  "claude-3.5-haiku": { input: 0.8, output: 4.0, context: 200000 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0, context: 1048576 },
  "gemini-2.5-flash": { input: 0.15, output: 0.6, context: 1048576 },
};

export default function TokenCalculatorPage() {
  const [text, setText] = useState("");
  const [model, setModel] = useState("gpt-4o");
  const [outputRatio, setOutputRatio] = useState(1.0);

  const tokens = useMemo(() => Math.max(1, Math.ceil(text.length / 4)), [text]);
  const outputTokens = Math.ceil(tokens * outputRatio);
  const pricing = MODEL_PRICING[model];

  const inputCost = pricing
    ? (tokens / 1_000_000) * pricing.input
    : 0;
  const outputCost = pricing
    ? (outputTokens / 1_000_000) * pricing.output
    : 0;
  const totalCost = inputCost + outputCost;
  const contextUsage = pricing
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
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              >
                {Object.keys(MODEL_PRICING).map((m) => (
                  <option key={m} value={m}>
                    {m}
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
                {contextUsage}% of {pricing?.context.toLocaleString()} tokens
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
