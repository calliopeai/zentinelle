/**
 * Providers (`/models/providers`, formerly `/settings/llm-providers`) and
 * Route check (`/models/routes`, formerly `/models/route-canary`): admin-only
 * REST surfaces, in the shapes the current pages parse.
 *
 * - `GET /assistant/providers`: the provider ids with a usable key (tenant or env).
 * - `GET /settings/llm-providers`: the tenant's stored keys, prefix only.
 * - `GET /assistant/models?provider=`: a provider's models for the assistant picker.
 * - `GET /models/route-canary`: recent route checks.
 */

export interface StoredProviderKey {
  provider: string;
  keyPrefix: string;
  isActive: boolean;
  enabledForAssistant: boolean;
  updatedAt: string;
}

export interface ProviderModel {
  id: string;
  model_id: string;
  name: string;
  context_window: number;
  enabled_for_chat: boolean;
  deprecated: boolean;
}

export interface CanaryResult {
  id: string;
  provider: string;
  model: string;
  status: "passed" | "failed" | "rolled_back" | string;
  reason: string;
  created_at: string;
  evidence?: { side_effects?: boolean };
}

export const PROVIDER_CATEGORIES = [
  {
    key: "direct",
    label: "Direct API",
    providers: [
      "anthropic",
      "openai",
      "google",
      "mistral",
      "cohere",
      "ai21",
      "deepseek",
    ],
  },
  {
    key: "cloud",
    label: "Cloud and managed",
    providers: ["bedrock", "azure", "vertex"],
  },
  {
    key: "inference",
    label: "Inference platforms",
    providers: [
      "fireworks",
      "together",
      "groq",
      "cerebras",
      "sambanova",
      "nvidia",
      "perplexity",
      "xai",
    ],
  },
  { key: "routing", label: "Routing", providers: ["openrouter", "litellm"] },
  {
    key: "local",
    label: "Local and self-hosted",
    providers: ["ollama", "lmstudio", "anythingllm", "huggingface"],
  },
] as const;

export type ProviderCategory = (typeof PROVIDER_CATEGORIES)[number]["key"];

export const PROVIDER_LABELS: Record<string, string> = {
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

/** The environment variable each provider falls back to. Bedrock, Azure and Vertex use the cloud's own credentials. */
export const PROVIDER_ENV_VARS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  google: "GOOGLE_API_KEY",
  mistral: "MISTRAL_API_KEY",
  cohere: "COHERE_API_KEY",
  ai21: "AI21_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
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
  anythingllm: "ANYTHINGLLM_URL",
  huggingface: "HF_API_TOKEN",
};

/** Reached by URL, not a key: configured by environment only. */
const URL_ONLY = new Set(["ollama", "lmstudio"]);

export interface ProviderRow {
  id: string;
  label: string;
  category: ProviderCategory;
  /** A usable key exists, the tenant's or the environment's. */
  active: boolean;
  /** The tenant's own key, prefix only. Absent: none stored. */
  storedKey: StoredProviderKey | null;
  envVar: string | null;
  urlOnly: boolean;
}

export function toProviderRows(
  available: readonly string[],
  stored: readonly StoredProviderKey[],
): ProviderRow[] {
  const active = new Set(available);
  const keys = new Map(stored.map((k) => [k.provider, k]));
  return PROVIDER_CATEGORIES.flatMap((category) =>
    category.providers.map((id) => ({
      id,
      label: PROVIDER_LABELS[id] ?? id,
      category: category.key,
      active: active.has(id),
      storedKey: keys.get(id) ?? null,
      envVar: PROVIDER_ENV_VARS[id] ?? null,
      urlOnly: URL_ONLY.has(id),
    })),
  );
}
