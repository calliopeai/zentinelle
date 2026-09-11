"use client";

import { useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CoinsIcon, RefreshCwIcon, AlertTriangleIcon } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
const GROUPS = ["endpoint", "team", "app", "session", "task"] as const;
type Group = (typeof GROUPS)[number];
type Entry = {
  dimension_id: string; requests: number; committed_usd: number;
  actual_usd: number | null; unreconciled_requests: number;
  anomaly: boolean; status: "reconciled" | "unreconciled" | "anomaly";
};
type Report = { entries: Entry[]; totals: { committed_usd: number; actual_usd: number | null }; source: string };

function money(value: number | null) {
  return value == null ? "—" : `$${value.toFixed(4)}`;
}

export default function BudgetShowbackPage() {
  const [group, setGroup] = useState<Group>("endpoint");
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const response = await authenticatedFetch(`${API_URL}/budgets/showback?group_by=${group}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || data.error || "Unable to load budget showback");
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load budget showback");
    } finally { setLoading(false); }
  }, [group]);

  useEffect(() => { void load(); }, [load]);
  const entries = report?.entries ?? [];
  const unreconciled = entries.reduce((sum, row) => sum + row.unreconciled_requests, 0);
  const anomalies = entries.filter((row) => row.anomaly).length;

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between gap-4">
        <div><h1 className="text-2xl font-semibold">Budget Showback</h1><p className="text-muted-foreground text-sm">Trusted provider usage reconciled against admitted spend.</p></div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCwIcon className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Committed</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(report?.totals.committed_usd ?? null)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Actual provider usage</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{money(report?.totals.actual_usd ?? null)}</CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Reconciliation health</CardTitle></CardHeader><CardContent className="flex items-center gap-3 text-2xl font-bold"><CoinsIcon className="h-5 w-5" />{unreconciled ? `${unreconciled} pending` : "Current"}{anomalies > 0 && <Badge variant="destructive"><AlertTriangleIcon className="mr-1 h-3 w-3" />{anomalies}</Badge>}</CardContent></Card>
      </div>
      <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Spend by dimension</CardTitle><Select value={group} onValueChange={(value) => setGroup(value as Group)}><SelectTrigger className="w-40"><SelectValue /></SelectTrigger><SelectContent>{GROUPS.map((item) => <SelectItem key={item} value={item}>{item[0].toUpperCase() + item.slice(1)}</SelectItem>)}</SelectContent></Select></CardHeader><CardContent>
        {error ? <p className="text-destructive py-8 text-center text-sm">{error}</p> : loading ? <p className="text-muted-foreground py-8 text-center text-sm">Loading showback…</p> : entries.length === 0 ? <p className="text-muted-foreground py-8 text-center text-sm">No budget charges recorded.</p> : <Table><TableHeader><TableRow><TableHead>{group}</TableHead><TableHead>Requests</TableHead><TableHead>Committed</TableHead><TableHead>Actual</TableHead><TableHead>Status</TableHead></TableRow></TableHeader><TableBody>{entries.map((row) => <TableRow key={`${row.dimension_id}-${row.status}`}><TableCell className="font-mono text-xs">{row.dimension_id || "Unassigned"}</TableCell><TableCell>{row.requests}</TableCell><TableCell>{money(row.committed_usd)}</TableCell><TableCell>{money(row.actual_usd)}</TableCell><TableCell><Badge variant={row.status === "anomaly" ? "destructive" : row.status === "unreconciled" ? "secondary" : "default"}>{row.status}</Badge></TableCell></TableRow>)}</TableBody></Table>}
        <p className="text-muted-foreground mt-4 text-xs">Source: {report?.source ?? "trusted-provider-api-reconciliation"}</p>
      </CardContent></Card>
    </div>
  );
}
