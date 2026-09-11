"use client";

import { use, useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/fetch";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
type ControlData = {
  agent: { model_routes?: unknown[]; data_access?: unknown[]; tools?: unknown[]; budget?: Record<string, unknown>; authority?: unknown[] };
  policies: Array<{ id: string; name: string; type: string; version: number; enforcement: string }>;
};

function Values({ values }: { values: unknown[] | undefined }) {
  if (!values?.length) return <p className="text-muted-foreground text-sm">None registered</p>;
  return <div className="flex flex-wrap gap-1">{values.map((value, index) => <Badge key={`${String(value)}-${index}`} variant="secondary">{typeof value === "string" ? value : JSON.stringify(value)}</Badge>)}</div>;
}

export default function AgentControlsPage({ params }: { params: Promise<{ agentId: string }> }) {
  const { agentId } = use(params);
  const [data, setData] = useState<ControlData | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "error">("loading");

  useEffect(() => {
    let active = true;
    authenticatedFetch(`${API_URL}/agents/${encodeURIComponent(agentId)}/control`)
      .then(async (response) => {
        if (!active) return;
        if (response.status === 401 || response.status === 403) { setState("denied"); return; }
        if (!response.ok) { setState("error"); return; }
        setData(await response.json()); setState("ready");
      })
      .catch(() => active && setState("error"));
    return () => { active = false; };
  }, [agentId]);

  if (state === "loading") return <Skeleton className="h-64 w-full" />;
  if (state === "denied") return <div className="border rounded-lg p-6"><p className="font-medium">Controls require administrator access</p><p className="text-muted-foreground mt-1 text-sm">Your role cannot inspect or change this agent&apos;s operating authority.</p></div>;
  if (state === "error" || !data) return <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-6 text-sm">Unable to load agent controls.</div>;
  const agent = data.agent;
  return <div className="grid gap-4 md:grid-cols-2">
    <Card><CardHeader><CardTitle>Model routes</CardTitle></CardHeader><CardContent><Values values={agent.model_routes} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Data access</CardTitle></CardHeader><CardContent><Values values={agent.data_access} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Delegated tools</CardTitle></CardHeader><CardContent><Values values={agent.tools} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Authority</CardTitle></CardHeader><CardContent><Values values={agent.authority} /></CardContent></Card>
    <Card><CardHeader><CardTitle>Budget</CardTitle></CardHeader><CardContent>{agent.budget && Object.keys(agent.budget).length ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(agent.budget, null, 2)}</pre> : <p className="text-muted-foreground text-sm">No budget configured</p>}</CardContent></Card>
    <Card><CardHeader><CardTitle>Effective policies</CardTitle></CardHeader><CardContent>{data.policies.length ? <div className="space-y-2">{data.policies.map((policy) => <div key={policy.id} className="flex items-center justify-between gap-2 text-sm"><span>{policy.name}</span><Badge variant="outline">v{policy.version} · {policy.enforcement}</Badge></div>)}</div> : <p className="text-muted-foreground text-sm">No effective policies</p>}</CardContent></Card>
  </div>;
}
