"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2Icon, SearchIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/zentinelle/v1";

interface ModelEntry {
  id: string;
  model_id: string;
  name: string;
  release_date: string | null;
  context_window: number;
  capabilities: string[];
  is_available: boolean;
  enabled_for_chat: boolean;
  deprecated: boolean;
}

export function ManageModelsDialog({
  provider,
  providerLabel,
  open,
  onOpenChange,
}: {
  provider: string;
  providerLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [models, setModels] = useState<ModelEntry[]>([]);
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState("");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`${API_URL}/assistant/models?provider=${provider}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.models) return;
        const list = data.models as ModelEntry[];
        setModels(list);
        setEnabledIds(
          new Set(list.filter((m) => m.enabled_for_chat).map((m) => m.model_id))
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, provider]);

  const filtered = models.filter((m) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      m.name.toLowerCase().includes(f) ||
      m.model_id.toLowerCase().includes(f)
    );
  });

  const toggle = (modelId: string) => {
    setEnabledIds((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) next.delete(modelId);
      else next.add(modelId);
      return next;
    });
  };

  const enableAll = () => setEnabledIds(new Set(models.map((m) => m.model_id)));
  const disableAll = () => setEnabledIds(new Set());

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/assistant/models/bulk`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          enabled_ids: Array.from(enabledIds),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.error ?? "Failed to save");
        return;
      }
      const data = await res.json();
      toast.success(
        `Updated ${data.updated} ${providerLabel} model${data.updated === 1 ? "" : "s"}`
      );
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const enabledCount = enabledIds.size;
  const totalCount = models.length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Manage {providerLabel} models</DialogTitle>
          <DialogDescription>
            Pick which models appear in the assistant chat picker. Disabled
            models are hidden but their keys, history, and policy decisions
            are unaffected.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <SearchIcon className="absolute left-2 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Filter models…"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>
            <Button size="sm" variant="ghost" onClick={enableAll}>
              Enable all
            </Button>
            <Button size="sm" variant="ghost" onClick={disableAll}>
              Disable all
            </Button>
          </div>

          <div className="text-xs text-muted-foreground">
            {enabledCount} of {totalCount} enabled
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-md border">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                <Loader2Icon className="size-4 animate-spin mr-2" />
                Loading…
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                {models.length === 0
                  ? "No models discovered yet for this provider."
                  : "No models match your filter."}
              </div>
            ) : (
              <ul className="divide-y">
                {filtered.map((m) => {
                  const isEnabled = enabledIds.has(m.model_id);
                  return (
                    <li
                      key={m.model_id}
                      className="flex items-center justify-between gap-3 px-3 py-2 hover:bg-muted/30"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm">{m.name}</span>
                          {m.deprecated && (
                            <span className="text-[10px] uppercase tracking-wide text-amber-500 border border-amber-500/40 rounded px-1">
                              deprecated
                            </span>
                          )}
                          {!m.is_available && (
                            <span className="text-[10px] uppercase tracking-wide text-muted-foreground border rounded px-1">
                              unavailable
                            </span>
                          )}
                          {m.release_date && (
                            <span className="text-[10px] text-muted-foreground">
                              {m.release_date}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground font-mono break-all">
                          {m.model_id}
                        </div>
                      </div>
                      <Switch
                        checked={isEnabled}
                        onCheckedChange={() => toggle(m.model_id)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
