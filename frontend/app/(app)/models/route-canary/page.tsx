"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { authenticatedFetch } from "@/lib/auth/fetch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";
type Result = { id: string; provider: string; model: string; status: string; reason: string; created_at: string; evidence?: { side_effects?: boolean } };

export default function RouteCanaryPage() {
  const [provider, setProvider] = useState("");
  const [model, setModel] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try { const response = await authenticatedFetch(`${API_URL}/models/route-canary`); if (!response.ok) throw new Error("Unable to load canary history"); setResults((await response.json()).results ?? []); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load canary history"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const run = async (event: FormEvent) => {
    event.preventDefault(); setRunning(true); setError(null);
    try { const response = await authenticatedFetch(`${API_URL}/models/route-canary`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider, model }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || "Canary failed"); setResults((rows) => [{ ...data, status: data.allowed ? "passed" : "failed", created_at: new Date().toISOString(), reason: data.reason }, ...rows]); }
    catch (err) { setError(err instanceof Error ? err.message : "Canary failed"); }
    finally { setRunning(false); }
  };
  return <div className="space-y-6 p-6"><div><h1 className="text-2xl font-semibold">Model Route Canary</h1><p className="text-muted-foreground text-sm">Preflight route authorization before provider traffic. Canaries have no provider side effects.</p></div><Card><CardHeader><CardTitle>Run canary</CardTitle></CardHeader><CardContent><form className="flex flex-wrap gap-3" onSubmit={run}><Input className="w-48" placeholder="Provider" value={provider} onChange={(event) => setProvider(event.target.value)} required /><Input className="w-64" placeholder="Model ID" value={model} onChange={(event) => setModel(event.target.value)} required /><Button type="submit" disabled={running}>{running ? "Running…" : "Run canary"}</Button></form>{error && <p className="text-destructive mt-3 text-sm">{error}</p>}</CardContent></Card><Card><CardHeader><CardTitle>Recent results</CardTitle></CardHeader><CardContent>{loading ? <p className="text-muted-foreground py-8 text-center text-sm">Loading history…</p> : !results.length ? <p className="text-muted-foreground py-8 text-center text-sm">No canary results yet.</p> : <Table><TableHeader><TableRow><TableHead>Provider / model</TableHead><TableHead>Status</TableHead><TableHead>Reason</TableHead><TableHead>When</TableHead></TableRow></TableHeader><TableBody>{results.map((result) => <TableRow key={result.id}><TableCell className="font-mono text-xs">{result.provider}/{result.model}</TableCell><TableCell><Badge variant={result.status === "passed" ? "default" : "destructive"}>{result.status}</Badge></TableCell><TableCell>{result.reason}</TableCell><TableCell className="text-muted-foreground text-xs">{new Date(result.created_at).toLocaleString()}</TableCell></TableRow>)}</TableBody></Table>}</CardContent></Card></div>;
}
