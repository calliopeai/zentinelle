"use client";

import { authenticatedFetch } from "@/lib/auth/fetch";

import { useState, useEffect } from "react";

export interface ChatModel {
  value: string;
  label: string;
  provider: string;
  releaseDate?: string;
  supportsTools?: boolean;
  supportsVision?: boolean;
  contextWindow?: number;
  capabilities?: string[];
}

export const MODELS: ChatModel[] = [
  {
    value: "claude-sonnet-4-20250514",
    label: "Claude Sonnet 4",
    provider: "Anthropic",
  },
  {
    value: "claude-opus-4-20250514",
    label: "Claude Opus 4",
    provider: "Anthropic",
  },
  { value: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { value: "o3-mini", label: "o3-mini", provider: "OpenAI" },
  { value: "deepseek-chat", label: "DeepSeek Chat", provider: "DeepSeek" },
  { value: "llama-3.3-70b", label: "Llama 3.3 70B", provider: "Together/Groq" },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "/api/zentinelle/v1";

export interface UseModelsOptions {
  /** Only show models that support function calling / tool use */
  requireTools?: boolean;
  /** Sort: 'recent' (default, newest first) or 'name' */
  sortBy?: "recent" | "name";
}

/**
 * Fetch providers and their models from the backend.
 * Filtered to providers with API keys configured. Sorted by release date by default.
 */
export function useAvailableModels(opts: UseModelsOptions = {}) {
  const { requireTools = false, sortBy = "recent" } = opts;
  const [models, setModels] = useState<ChatModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasResult, setHasResult] = useState(false);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (requireTools) params.set("require_tools", "true");
    const url = `${API_URL}/assistant/providers${params.toString() ? "?" + params.toString() : ""}`;

    authenticatedFetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!data?.providers || !Array.isArray(data.providers)) return;
        const flat: ChatModel[] = [];
        for (const p of data.providers) {
          for (const m of p.models ?? []) {
            flat.push({
              value: m.value,
              label: m.label,
              provider: p.name,
              releaseDate: m.releaseDate,
              supportsTools: m.supportsTools,
              supportsVision: m.supportsVision,
              contextWindow: m.contextWindow,
              capabilities: m.capabilities,
            });
          }
        }
        // Sort
        if (sortBy === "recent") {
          flat.sort((a, b) => {
            const aDate = a.releaseDate ?? "";
            const bDate = b.releaseDate ?? "";
            return bDate.localeCompare(aDate);
          });
        } else {
          flat.sort((a, b) => a.label.localeCompare(b.label));
        }
        setModels(flat);
        setHasResult(true);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [requireTools, sortBy]);

  // Fall back to hardcoded MODELS only if backend returned nothing AND finished loading
  const result =
    hasResult && models.length === 0
      ? MODELS
      : models.length > 0
        ? models
        : MODELS;

  return { models: result, loading };
}
