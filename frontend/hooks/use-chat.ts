"use client";

import { useState, useCallback, useRef, useEffect } from "react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

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
  { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "Anthropic" },
  { value: "claude-opus-4-20250514", label: "Claude Opus 4", provider: "Anthropic" },
  { value: "gpt-4o", label: "GPT-4o", provider: "OpenAI" },
  { value: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI" },
  { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "Google" },
  { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "Google" },
  { value: "o3-mini", label: "o3-mini", provider: "OpenAI" },
  { value: "deepseek-chat", label: "DeepSeek Chat", provider: "DeepSeek" },
  { value: "llama-3.3-70b", label: "Llama 3.3 70B", provider: "Together/Groq" },
];

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080/api/zentinelle/v1";

let messageCounter = 0;

function createId(): string {
  messageCounter += 1;
  return `msg_${Date.now()}_${messageCounter}`;
}

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

    fetch(url, { credentials: "include" })
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
  const result = hasResult && models.length === 0 ? MODELS : (models.length > 0 ? models : MODELS);

  return { models: result, loading };
}

export function useChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [model, setModel] = useState("claude-sonnet-4-20250514");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || isStreaming) return;

      setError(null);

      const userMessage: Message = {
        id: createId(),
        role: "user",
        content: content.trim(),
        timestamp: new Date(),
      };

      const assistantMessage: Message = {
        id: createId(),
        role: "assistant",
        content: "",
        timestamp: new Date(),
      };

      setMessages((prev) => [...prev, userMessage, assistantMessage]);
      setIsStreaming(true);

      const assistantId = assistantMessage.id;

      const history = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      const pageContext =
        typeof window !== "undefined" ? window.location.pathname : "/";

      abortRef.current = new AbortController();

      try {
        const res = await fetch(`${API_URL}/assistant/chat`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: content.trim(),
            history,
            page_context: pageContext,
            model,
          }),
          signal: abortRef.current.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          const errMsg = errData?.error || `Request failed (${res.status})`;
          setError(errMsg);
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
          setIsStreaming(false);
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setError("No response stream available");
          setIsStreaming(false);
          return;
        }

        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });

          const lines = buffer.split("\n");
          // Keep the last partial line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            const data = trimmed.slice(6);

            if (data === "[DONE]") {
              setIsStreaming(false);
              return;
            }

            try {
              const parsed = JSON.parse(data);

              if (parsed.error) {
                setError(parsed.error);
                setIsStreaming(false);
                return;
              }

              if (parsed.content) {
                setMessages((prev) =>
                  prev.map((m) =>
                    m.id === assistantId
                      ? { ...m, content: m.content + parsed.content }
                      : m
                  )
                );
              }
            } catch {
              // Ignore malformed JSON lines
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") {
          // User cancelled -- not an error
        } else {
          setError("Connection failed. Check that the backend is running.");
          setMessages((prev) => prev.filter((m) => m.id !== assistantId));
        }
      } finally {
        setIsStreaming(false);
        abortRef.current = null;
      }
    },
    [isStreaming, messages, model]
  );

  const clearChat = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setError(null);
    setIsStreaming(false);
  }, []);

  const stopStreaming = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
  }, []);

  return {
    messages,
    isStreaming,
    model,
    setModel,
    sendMessage,
    clearChat,
    stopStreaming,
    error,
  };
}
