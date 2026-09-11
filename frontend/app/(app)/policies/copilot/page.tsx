"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { authenticatedFetch } from "@/lib/auth/fetch";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

export default function PolicyCopilotPage() {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [prompt, setPrompt] = useState("");
  const [policyId, setPolicyId] = useState("");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [staged, setStaged] = useState("");

  useEffect(() => {
    authenticatedFetch(`${API_URL}/policy-copilot/status`)
      .then((response) => response.json())
      .then((data) => setEnabled(Boolean(data.enabled)))
      .catch(() => setEnabled(false));
  }, []);

  const preview = async () => {
    setBusy(true);
    setError("");
    try {
      const draftResponse = await authenticatedFetch(`${API_URL}/policy-copilot/draft`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      const draftData = await draftResponse.json();
      if (!draftResponse.ok) throw new Error(draftData.error || "Unable to create draft");
      const diffResponse = await authenticatedFetch(`${API_URL}/policy-copilot/diff`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_id: policyId, draft: draftData.draft }),
      });
      const diffData = await diffResponse.json();
      if (!diffResponse.ok) throw new Error(diffData.error || "Unable to preview diff");
      setResult(diffData);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to preview policy change");
    } finally {
      setBusy(false);
    }
  };

  const stage = async () => {
    if (!result?.after) return;
    setBusy(true);
    setError("");
    try {
      const response = await authenticatedFetch(`${API_URL}/policy-copilot/stage`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policy_id: policyId, draft: result.after }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to stage draft");
      setStaged(String(data.change_id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to stage draft");
    } finally {
      setBusy(false);
    }
  };

  if (enabled === false) return <div className="p-6"><Card><CardHeader><CardTitle>Policy copilot unavailable</CardTitle><CardDescription>Enable the feature and configure an assistant provider key in Runtime globals.</CardDescription></CardHeader></Card></div>;
  if (enabled === null) return <div className="p-6 text-sm text-muted-foreground">Loading policy copilot…</div>;

  return <div className="flex flex-1 flex-col gap-6 p-6"><div><h1 className="text-xl font-semibold">Policy copilot</h1><p className="text-muted-foreground mt-1 text-sm">Draft and preview policy changes. Live policies are changed only through staged workflow.</p></div><Card><CardHeader><CardTitle className="text-base">Create a reviewable draft</CardTitle><CardDescription>Use a precise request and optionally identify the policy to compare.</CardDescription></CardHeader><CardContent className="space-y-4"><div className="space-y-2"><Label htmlFor="copilot-prompt">Request</Label><Input id="copilot-prompt" placeholder="Restrict model gpt-5 for support agents" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></div><div className="space-y-2"><Label htmlFor="copilot-policy">Existing policy ID (optional)</Label><Input id="copilot-policy" placeholder="UUID" value={policyId} onChange={(event) => setPolicyId(event.target.value)} /></div><Button onClick={preview} disabled={busy || !prompt.trim()}>{busy ? "Previewing…" : "Preview draft and impact"}</Button>{error && <p className="text-sm text-destructive">{error}</p>}</CardContent></Card>{result && <Card><CardHeader><CardTitle className="text-base">Impact preview</CardTitle><CardDescription>Review this diff, then submit it through the staged policy workflow.</CardDescription></CardHeader><CardContent className="space-y-3 text-sm"><p><strong>Changed fields:</strong> {((result.changed_fields as string[]) || []).join(", ") || "none"}</p><p><strong>Impacted agents:</strong> {String(result.impacted_agent_count ?? 0)}</p><pre className="bg-muted overflow-auto rounded-md p-3 text-xs">{JSON.stringify(result.after, null, 2)}</pre><Button onClick={stage} disabled={busy}>{busy ? "Staging…" : "Stage for review"}</Button>{staged && <p className="text-sm text-green-600">Staged change {staged}; continue in Policy Changes for validation and approval.</p>}</CardContent></Card>}</div>;
}
