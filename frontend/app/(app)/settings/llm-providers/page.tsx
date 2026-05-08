"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CheckCircleIcon,
  XCircleIcon,
  CpuIcon,
  ServerIcon,
  CloudIcon,
  KeyIcon,
  TrashIcon,
  PlusIcon,
} from "lucide-react";
import { toast } from "sonner";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/zentinelle/v1";

const PROVIDER_CATEGORIES: Record<string, string[]> = {
  "Direct API": ["anthropic", "openai", "google", "mistral", "cohere", "ai21", "deepseek"],
  "Cloud / Managed": ["bedrock", "azure", "vertex"],
  "Inference Platforms": ["fireworks", "together", "groq", "cerebras", "sambanova", "nvidia", "perplexity", "xai"],
  "Routing": ["openrouter", "litellm"],
  "Local / Self-hosted": ["ollama", "lmstudio", "anythingllm", "huggingface"],
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", google: "Google", mistral: "Mistral AI",
  cohere: "Cohere", ai21: "AI21", deepseek: "DeepSeek", bedrock: "AWS Bedrock",
  azure: "Azure OpenAI", vertex: "Vertex AI", fireworks: "Fireworks",
  together: "Together", groq: "Groq", cerebras: "Cerebras", sambanova: "SambaNova",
  nvidia: "NVIDIA", perplexity: "Perplexity", xai: "xAI", openrouter: "OpenRouter",
  litellm: "LiteLLM", ollama: "Ollama", lmstudio: "LM Studio",
  anythingllm: "AnythingLLM", huggingface: "HuggingFace",
};

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY", openai: "OPENAI_API_KEY", google: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY", cohere: "COHERE_API_KEY", ai21: "AI21_API_KEY",
  deepseek: "DEEPSEEK_API_KEY", fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_API_KEY", groq: "GROQ_API_KEY", cerebras: "CEREBRAS_API_KEY",
  sambanova: "SAMBANOVA_API_KEY", nvidia: "NVIDIA_API_KEY",
  perplexity: "PERPLEXITY_API_KEY", xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY", litellm: "LITELLM_API_KEY",
  ollama: "OLLAMA_URL", lmstudio: "LMSTUDIO_URL",
  anythingllm: "ANYTHINGLLM_URL", huggingface: "HF_API_TOKEN",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Direct API": <CpuIcon className="h-4 w-4" />,
  "Cloud / Managed": <CloudIcon className="h-4 w-4" />,
  "Inference Platforms": <ServerIcon className="h-4 w-4" />,
  "Routing": <ServerIcon className="h-4 w-4" />,
  "Local / Self-hosted": <CpuIcon className="h-4 w-4" />,
};

interface StoredKey {
  provider: string;
  keyPrefix: string;
  isActive: boolean;
  enabledForAssistant: boolean;
  updatedAt: string;
}

export default function LLMProvidersPage() {
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [stored, setStored] = useState<Map<string, StoredKey>>(new Map());
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [saving, setSaving] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const [providersRes, keysRes] = await Promise.all([
        fetch(`${API_URL}/assistant/providers`, { credentials: "include" }),
        fetch(`${API_URL}/settings/llm-providers`, { credentials: "include" }),
      ]);
      if (providersRes.ok) {
        const data = await providersRes.json();
        setAvailable(
          new Set<string>((data.providers ?? []).map((p: { id: string }) => p.id)),
        );
      }
      if (keysRes.ok) {
        const data = await keysRes.json();
        const map = new Map<string, StoredKey>();
        (data.providers ?? []).forEach((k: StoredKey) => map.set(k.provider, k));
        setStored(map);
      }
    } catch {}
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSave = async () => {
    if (!editing || !keyValue.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/settings/llm-providers`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: editing, apiKey: keyValue.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? "Save failed");
      }
      toast.success(`${PROVIDER_LABELS[editing] ?? editing} key saved`);
      setEditing(null);
      setKeyValue("");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save key");
    }
    setSaving(false);
  };

  const handleToggleAssistant = async (provider: string, current: boolean) => {
    try {
      const res = await fetch(`${API_URL}/settings/llm-providers`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          enabledForAssistant: !current,
        }),
      });
      if (!res.ok) throw new Error("Toggle failed");
      toast.success(
        `${PROVIDER_LABELS[provider] ?? provider} ${!current ? "enabled" : "disabled"} for assistant`,
      );
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to toggle");
    }
  };

  const handleDelete = async (provider: string) => {
    if (!confirm(`Remove ${PROVIDER_LABELS[provider] ?? provider} API key?`)) return;
    try {
      const res = await fetch(
        `${API_URL}/settings/llm-providers/${provider}`,
        { method: "DELETE", credentials: "include" },
      );
      if (!res.ok) throw new Error("Delete failed");
      toast.success("Key removed");
      await refresh();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  const allProviders = Object.values(PROVIDER_CATEGORIES).flat();
  const configuredCount = allProviders.filter((p) => available.has(p)).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">LLM Providers</h1>
        <p className="text-muted-foreground">
          Configure API keys for AI providers. Keys are encrypted at rest.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-3xl font-bold">
                {configuredCount} / {allProviders.length}
              </div>
              <div className="text-muted-foreground text-sm">
                Providers configured
              </div>
            </div>
            <p className="text-sm text-muted-foreground max-w-md text-right">
              Configure keys here or via environment variables. Tenant keys take
              priority over env vars.
            </p>
          </div>
        </CardContent>
      </Card>

      {Object.entries(PROVIDER_CATEGORIES).map(([category, providers]) => (
        <div key={category}>
          <h2 className="text-sm font-medium text-muted-foreground uppercase mb-3 flex items-center gap-2">
            {CATEGORY_ICONS[category]}
            {category}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {providers.map((provider) => {
              const isAvailable = available.has(provider);
              const storedKey = stored.get(provider);
              const isLocal = ["ollama", "lmstudio"].includes(provider);

              return (
                <Card
                  key={provider}
                  className={isAvailable ? "border-primary/30" : ""}
                >
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">
                        {PROVIDER_LABELS[provider] ?? provider}
                      </CardTitle>
                      {loading ? (
                        <Badge variant="outline">…</Badge>
                      ) : isAvailable ? (
                        <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                          <CheckCircleIcon className="h-3 w-3 mr-1" />
                          Active
                        </Badge>
                      ) : (
                        <Badge className="bg-muted text-muted-foreground">
                          <XCircleIcon className="h-3 w-3 mr-1" />
                          Not configured
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {storedKey ? (
                      <>
                        <div className="text-xs text-muted-foreground">
                          Key: <code className="font-mono">{storedKey.keyPrefix}…</code>
                        </div>
                        <label className="flex items-center justify-between text-xs cursor-pointer">
                          <span className="text-muted-foreground">
                            Available in AI Assistant
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              handleToggleAssistant(
                                provider,
                                storedKey.enabledForAssistant,
                              )
                            }
                            className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                              storedKey.enabledForAssistant
                                ? "bg-primary"
                                : "bg-muted-foreground/30"
                            }`}
                          >
                            <span
                              className={`inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform ${
                                storedKey.enabledForAssistant
                                  ? "translate-x-5"
                                  : "translate-x-1"
                              }`}
                            />
                          </button>
                        </label>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(provider);
                              setKeyValue("");
                            }}
                          >
                            <KeyIcon className="h-3 w-3 mr-1" />
                            Rotate
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(provider)}
                          >
                            <TrashIcon className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-muted-foreground text-xs font-mono">
                          {isLocal ? `Set ${PROVIDER_ENV_VARS[provider]} env var` : `Env: ${PROVIDER_ENV_VARS[provider]}`}
                        </p>
                        {isLocal && (
                          <label className="flex items-center justify-between text-xs cursor-pointer">
                            <span className="text-muted-foreground">
                              Available in AI Assistant
                            </span>
                            <button
                              type="button"
                              onClick={() => handleToggleAssistant(provider, true)}
                              className="relative inline-flex h-5 w-9 items-center rounded-full bg-primary"
                            >
                              <span className="inline-block h-3.5 w-3.5 rounded-full bg-white translate-x-5" />
                            </button>
                          </label>
                        )}
                        {!isLocal && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setEditing(provider);
                              setKeyValue("");
                            }}
                          >
                            <PlusIcon className="h-3 w-3 mr-1" />
                            Add Key
                          </Button>
                        )}
                      </>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {stored.has(editing ?? "") ? "Rotate" : "Configure"}{" "}
              {editing ? PROVIDER_LABELS[editing] ?? editing : ""} API Key
            </DialogTitle>
            <DialogDescription>
              Pasted keys are encrypted at rest with Fernet (AES-128 + HMAC-SHA256).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="text-sm font-medium">API Key</label>
            <input
              type="password"
              value={keyValue}
              onChange={(e) => setKeyValue(e.target.value)}
              placeholder="sk-ant-... / sk-... / etc."
              className="border-input bg-background flex h-10 w-full rounded-md border px-3 font-mono text-sm"
              autoFocus
            />
            <p className="text-muted-foreground text-xs">
              The key is stored encrypted in the database. Only the first 8 characters
              are shown for identification.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving || !keyValue.trim()}>
              {saving ? "Saving..." : "Save Key"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
