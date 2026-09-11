"use client";

import { useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/fetch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { RefreshCwIcon } from "lucide-react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
type Workload = { agent_id: string; endpoint_id: string; status: "observed" | "unknown"; registered_status: string };
type Evidence = { runtime_coverage: { registered_workloads: number; observed_workloads: number; unobserved_workloads: number; workloads: Workload[] }; coverage: Record<string, number>; coverage_as_of: string | null };

export default function ControlEvidencePage() {
  const [data, setData] = useState<Evidence | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const load = async () => {
    setState("loading");
    try {
      const response = await authenticatedFetch(`${API_URL}/evidence/controls`);
      if (!response.ok) throw new Error("Unable to load control evidence");
      setData(await response.json()); setState("ready");
    } catch { setState("error"); }
  };
  useEffect(() => { void load(); }, []);
  const runtime = data?.runtime_coverage;
  return <div className="space-y-6 p-6">
    <div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">Control Evidence</h1><p className="text-muted-foreground text-sm">Runtime coverage and evidence freshness for this tenant.</p></div><Button variant="outline" size="sm" onClick={() => void load()} disabled={state === "loading"}><RefreshCwIcon className="mr-2 h-4 w-4" />Refresh</Button></div>
    {state === "error" && <p className="text-destructive text-sm">Unable to load control evidence.</p>}
    <div className="grid gap-4 md:grid-cols-4">
      {[['Registered workloads', runtime?.registered_workloads], ['Observed', runtime?.observed_workloads], ['Unknown', runtime?.unobserved_workloads], ['Evidence records', data ? Object.values(data.coverage).reduce((sum, value) => sum + value, 0) : undefined]].map(([label, value]) => <Card key={String(label)}><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{label}</CardTitle></CardHeader><CardContent className="text-2xl font-bold">{state === "loading" ? "…" : value ?? "—"}</CardContent></Card>)}
    </div>
    <Card><CardHeader><CardTitle>Workload runtime coverage</CardTitle></CardHeader><CardContent>{state === "loading" ? <p className="text-muted-foreground py-8 text-center text-sm">Loading evidence…</p> : !runtime?.workloads.length ? <p className="text-muted-foreground py-8 text-center text-sm">No registered workloads.</p> : <Table><TableHeader><TableRow><TableHead>Workload</TableHead><TableHead>Registered status</TableHead><TableHead>Runtime evidence</TableHead></TableRow></TableHeader><TableBody>{runtime.workloads.map((workload) => <TableRow key={workload.endpoint_id}><TableCell className="font-mono text-xs">{workload.agent_id}</TableCell><TableCell>{workload.registered_status}</TableCell><TableCell><Badge variant={workload.status === "observed" ? "default" : "secondary"}>{workload.status}</Badge></TableCell></TableRow>)}</TableBody></Table>}<p className="text-muted-foreground mt-4 text-xs">Evidence captured through {data?.coverage_as_of ? new Date(data.coverage_as_of).toLocaleString() : "no recorded evidence"}. Unknown means no endpoint-linked runtime event has been observed.</p></CardContent></Card>
  </div>;
}
