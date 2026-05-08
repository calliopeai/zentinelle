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
  CheckCircleIcon,
  XCircleIcon,
  CpuIcon,
  ServerIcon,
  CloudIcon,
} from "lucide-react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/zentinelle/v1";

const PROVIDER_CATEGORIES: Record<string, string[]> = {
  "Direct API": ["anthropic", "openai", "google", "mistral", "cohere", "ai21", "deepseek"],
  "Cloud / Managed": ["bedrock", "azure", "vertex"],
  "Inference Platforms": ["fireworks", "together", "groq", "cerebras", "sambanova", "nvidia", "perplexity", "xai"],
  "Routing": ["openrouter", "litellm"],
  "Local / Self-hosted": ["ollama", "lmstudio", "anythingllm", "huggingface"],
};

const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  ai21: "AI21_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  bedrock: "AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY",
  azure: "AZURE_OPENAI_API_KEY",
  vertex: "GOOGLE_APPLICATION_CREDENTIALS",
  fireworks: "FIREWORKS_API_KEY",
  together: "TOGETHER_API_KEY",
  groq: "GROQ_API_KEY",
  cerebras: "CEREBRAS_API_KEY",
  sambanova: "SAMBANOVA_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  perplexity: "PERPLEXITY_API_KEY",
  xai: "XAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  litellm: "LITELLM_API_KEY",
  ollama: "OLLAMA_URL",
  lmstudio: "LMSTUDIO_URL",
  anythingllm: "ANYTHINGLLM_URL + ANYTHINGLLM_API_KEY",
  huggingface: "HF_API_TOKEN",
};

const PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  google: "Google",
  mistral: "Mistral AI",
  cohere: "Cohere",
  ai21: "AI21",
  deepseek: "DeepSeek",
  bedrock: "AWS Bedrock",
  azure: "Azure OpenAI",
  vertex: "Vertex AI",
  fireworks: "Fireworks",
  together: "Together",
  groq: "Groq",
  cerebras: "Cerebras",
  sambanova: "SambaNova",
  nvidia: "NVIDIA",
  perplexity: "Perplexity",
  xai: "xAI",
  openrouter: "OpenRouter",
  litellm: "LiteLLM",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  anythingllm: "AnythingLLM",
  huggingface: "HuggingFace",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  "Direct API": <CpuIcon className="h-4 w-4" />,
  "Cloud / Managed": <CloudIcon className="h-4 w-4" />,
  "Inference Platforms": <ServerIcon className="h-4 w-4" />,
  "Routing": <ServerIcon className="h-4 w-4" />,
  "Local / Self-hosted": <CpuIcon className="h-4 w-4" />,
};

export default function LLMProvidersPage() {
  const [available, setAvailable] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_URL}/assistant/providers`, { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        const ids = new Set<string>(
          (data.providers ?? []).map((p: { id: string }) => p.id),
        );
        setAvailable(ids);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const allProviders = Object.values(PROVIDER_CATEGORIES).flat();
  const configuredCount = allProviders.filter((p) => available.has(p)).length;

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">LLM Providers</h1>
        <p className="text-muted-foreground">
          Configure which LLM providers Zentinelle can use for the AI assistant
          and policy enforcement
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
            <div className="text-right">
              <p className="text-sm text-muted-foreground max-w-md">
                API keys are configured via environment variables. Providers
                without keys are hidden from the model selector.
              </p>
            </div>
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
              return (
                <Card
                  key={provider}
                  className={isAvailable ? "border-primary/30" : "opacity-60"}
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
                        <Badge className="bg-muted text-muted-foreground border-muted-foreground/20">
                          <XCircleIcon className="h-3 w-3 mr-1" />
                          Not configured
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-xs font-mono">
                      {PROVIDER_ENV_VARS[provider] ?? ""}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How to configure</CardTitle>
          <CardDescription>
            Set environment variables in your .env file or docker-compose.yml
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted rounded-md p-3 text-xs overflow-x-auto">
{`# .env file
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GROQ_API_KEY=gsk_...
# ... etc.

# Then restart:
docker compose up -d`}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
