"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Technique = { id?: string | null; name: string; control?: string; enforcement_point?: string; owner?: string; evidence_status?: string; evidence_captured_at?: string | null };

export default function AtlasThreatsPage() {
  const [techniques, setTechniques] = useState<Technique[]>([]);
  const [meta, setMeta] = useState<{ disclaimer?: string }>({});
  const [error, setError] = useState("");
  useEffect(() => {
    fetch("/api/zentinelle/v1/threats/atlas", { credentials: "include" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("Unable to load ATLAS controls"))))
      .then((data) => { setTechniques(data.techniques ?? []); setMeta(data); })
      .catch((reason: Error) => setError(reason.message));
  }, []);
  return <div className="space-y-6 p-6">
    <div><h1 className="text-2xl font-semibold">MITRE ATLAS controls</h1><p className="text-muted-foreground">Threat-model mappings and operating evidence for governed agent paths.</p></div>
    {meta.disclaimer && <p className="rounded-md border p-3 text-sm text-muted-foreground">{meta.disclaimer}</p>}
    {error && <p className="text-sm text-destructive">{error}</p>}
    <div className="grid gap-4 md:grid-cols-2">{techniques.map((technique) => <Card key={`${technique.id ?? "unassigned"}-${technique.name}`}><CardHeader className="flex flex-row items-start justify-between gap-4"><CardTitle className="text-base">{technique.name}</CardTitle><Badge variant={technique.evidence_status === "verified-operating" ? "default" : "secondary"}>{technique.evidence_status ?? "unverified"}</Badge></CardHeader><CardContent className="space-y-2 text-sm"><div><span className="font-medium">Technique:</span> {technique.id ?? "Pending mapping"}</div>{technique.control && <div><span className="font-medium">Control:</span> {technique.control}</div>}{technique.enforcement_point && <div><span className="font-medium">Boundary:</span> {technique.enforcement_point}</div>}{technique.owner && <div><span className="font-medium">Owner:</span> {technique.owner}</div>}{technique.evidence_captured_at && <div className="text-muted-foreground">Evidence captured {new Date(technique.evidence_captured_at).toLocaleString()}</div>}</CardContent></Card>)}</div>
  </div>;
}
