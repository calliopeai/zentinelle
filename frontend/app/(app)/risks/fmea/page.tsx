"use client";

import { useMemo } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useRisks } from "@/graphql/risks/hooks";

const FIBONACCI = [1, 2, 3, 5, 8];
const SEVERITY_LABELS: Record<number, string> = { 1: "Minimal", 2: "Low", 3: "Moderate", 5: "High", 8: "Critical" };
const LIKELIHOOD_LABELS: Record<number, string> = { 1: "Rare", 2: "Unlikely", 3: "Possible", 5: "Likely", 8: "Almost Certain" };
const IMPACT_LABELS: Record<number, string> = { 1: "Negligible", 2: "Minor", 3: "Moderate", 5: "Major", 8: "Severe" };

function rpnColor(rpn: number) {
  if (rpn >= 200) return "text-red-500";
  if (rpn >= 75) return "text-orange-500";
  if (rpn >= 18) return "text-yellow-500";
  return "text-emerald-500";
}

function rpnBadge(rpn: number) {
  if (rpn >= 200) return "bg-red-500/15 text-red-400 border-red-500/30";
  if (rpn >= 75) return "bg-orange-500/15 text-orange-400 border-orange-500/30";
  if (rpn >= 18) return "bg-yellow-500/15 text-yellow-400 border-yellow-500/30";
  return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
}

function rpnLabel(rpn: number) {
  if (rpn >= 200) return "Critical";
  if (rpn >= 75) return "High";
  if (rpn >= 18) return "Medium";
  return "Low";
}

function fibLabel(val: number, labels: Record<number, string>) {
  return labels[val] ?? String(val);
}

export default function FMEAPage() {
  const { risks, loading } = useRisks();

  const sortedRisks = useMemo(() => {
    return [...risks]
      .map((r: any) => ({
        ...r,
        severity: r.severity ?? r.likelihood ?? 3,
        rpn: (r.severity ?? r.likelihood ?? 3) * (r.likelihood ?? 3) * (r.impact ?? 3),
      }))
      .sort((a, b) => b.rpn - a.rpn);
  }, [risks]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-12">
        <span className="text-muted-foreground">Loading FMEA analysis...</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">FMEA Risk Analysis</h1>
        <p className="text-muted-foreground">
          Failure Mode and Effects Analysis — Severity × Likelihood × Impact (Fibonacci scale 1-8)
        </p>
      </div>

      {/* Scale reference */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Fibonacci Scale Reference</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-6 text-sm">
            <div>
              <div className="font-medium mb-2">Severity (S)</div>
              {FIBONACCI.map((v) => (
                <div key={v} className="flex items-center gap-2 py-0.5">
                  <span className="font-mono w-4 text-right text-muted-foreground">{v}</span>
                  <span>{SEVERITY_LABELS[v]}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="font-medium mb-2">Likelihood (L)</div>
              {FIBONACCI.map((v) => (
                <div key={v} className="flex items-center gap-2 py-0.5">
                  <span className="font-mono w-4 text-right text-muted-foreground">{v}</span>
                  <span>{LIKELIHOOD_LABELS[v]}</span>
                </div>
              ))}
            </div>
            <div>
              <div className="font-medium mb-2">Impact (I)</div>
              {FIBONACCI.map((v) => (
                <div key={v} className="flex items-center gap-2 py-0.5">
                  <span className="font-mono w-4 text-right text-muted-foreground">{v}</span>
                  <span>{IMPACT_LABELS[v]}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 flex items-center gap-4 text-xs text-muted-foreground border-t pt-3">
            <span>RPN = S × L × I</span>
            <span>Range: 1–512</span>
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">Low (1–17)</Badge>
            <Badge className="bg-yellow-500/15 text-yellow-400 border-yellow-500/30">Medium (18–74)</Badge>
            <Badge className="bg-orange-500/15 text-orange-400 border-orange-500/30">High (75–199)</Badge>
            <Badge className="bg-red-500/15 text-red-400 border-red-500/30">Critical (200–512)</Badge>
          </div>
        </CardContent>
      </Card>

      {/* FMEA Table */}
      <Card>
        <CardHeader>
          <CardTitle>Risk Priority Numbers</CardTitle>
          <CardDescription>
            Risks ranked by RPN (highest first) — from the risk register
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sortedRisks.length === 0 ? (
            <p className="text-muted-foreground text-center py-8 text-sm">
              No risks in the register. Create risks first, then analyze here.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-3 px-2 font-medium">#</th>
                    <th className="text-left py-3 px-2 font-medium">Risk</th>
                    <th className="text-left py-3 px-2 font-medium">Category</th>
                    <th className="text-center py-3 px-2 font-medium">S</th>
                    <th className="text-center py-3 px-2 font-medium">L</th>
                    <th className="text-center py-3 px-2 font-medium">I</th>
                    <th className="text-center py-3 px-2 font-medium">RPN</th>
                    <th className="text-center py-3 px-2 font-medium">Level</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRisks.map((risk, i) => (
                    <tr key={risk.id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 text-muted-foreground">{i + 1}</td>
                      <td className="py-3 px-2 font-medium max-w-[250px] truncate">
                        {risk.name}
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant="outline" className="text-xs">
                          {(risk.category ?? "").replace(/_/g, " ")}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="font-mono font-bold">{risk.severity}</span>
                        <div className="text-[10px] text-muted-foreground">
                          {fibLabel(risk.severity, SEVERITY_LABELS)}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="font-mono font-bold">{risk.likelihood}</span>
                        <div className="text-[10px] text-muted-foreground">
                          {fibLabel(risk.likelihood, LIKELIHOOD_LABELS)}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className="font-mono font-bold">{risk.impact}</span>
                        <div className="text-[10px] text-muted-foreground">
                          {fibLabel(risk.impact, IMPACT_LABELS)}
                        </div>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <span className={`font-mono text-lg font-bold ${rpnColor(risk.rpn)}`}>
                          {risk.rpn}
                        </span>
                      </td>
                      <td className="py-3 px-2 text-center">
                        <Badge className={rpnBadge(risk.rpn)}>
                          {rpnLabel(risk.rpn)}
                        </Badge>
                      </td>
                      <td className="py-3 px-2">
                        <Badge variant="outline" className="text-xs">
                          {risk.status}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
