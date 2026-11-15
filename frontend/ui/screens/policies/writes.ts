/**
 * The Policies area's writes: the app's mutation documents, each checked
 * with the mutation contract (`payloadOrThrow`), and the REST calls of the
 * area (history, diff, effective policy, change sets, the copilot). The
 * containers in ./connected use these unless a story passes its own.
 */
import { useApolloClient, useMutation } from "@apollo/client/react";
import { useTranslations } from "next-intl";

import {
  CREATE_CONTENT_RULE,
  DELETE_CONTENT_RULE,
  DUPLICATE_CONTENT_RULE,
  TEST_CONTENT_RULE,
  TOGGLE_CONTENT_RULE_ENABLED,
  UPDATE_CONTENT_RULE,
} from "@/graphql/content-rules/mutations";
import { GET_CONTENT_RULES } from "@/graphql/content-rules/queries";
import type {
  ContentRuleData,
  CreateContentRuleInput,
  TestContentRulePayload,
} from "@/graphql/content-rules/types";
import {
  CREATE_POLICY,
  DELETE_POLICY,
  DUPLICATE_POLICY,
  TOGGLE_POLICY_ENABLED,
  UPDATE_POLICY,
} from "@/graphql/policies/mutations";
import { GET_POLICIES, GET_POLICY } from "@/graphql/policies/queries";
import type { CreatePolicyInput, PolicyData } from "@/graphql/policies/types";
import {
  ANALYZE_SYSTEM_PROMPT,
  CREATE_SYSTEM_PROMPT,
  DELETE_SYSTEM_PROMPT,
  FORK_SYSTEM_PROMPT,
  UPDATE_SYSTEM_PROMPT,
} from "@/graphql/prompts/mutations";
import {
  GET_SYSTEM_PROMPT,
  GET_SYSTEM_PROMPTS,
} from "@/graphql/prompts/queries";
import type {
  AnalyzeSystemPromptData,
  AnalyzeSystemPromptResult,
  SystemPromptData,
} from "@/graphql/prompts/types";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { payloadOrThrow } from "../../shared/mutation";
import type { PromptDraft } from "./prompts/PromptEditorScreen";
import type {
  EffectivePolicyResponse,
  PolicyChangeSet,
  PolicyDiff,
  PolicyVersion,
} from "./rest-types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/zentinelle/v1";

type Payload = {
  success?: boolean | null;
  error?: string | null;
  errors?: readonly string[] | null;
};

/** A REST call's JSON, or an Error with the server's message (empty when it says none). */
async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message = body.detail ?? body.error;
    throw new Error(typeof message === "string" ? message : "");
  }
  return body as T;
}

/** What the copilot's `diff` answers: the draft against the live policy, and its replay. */
export interface CopilotPreview {
  policy_id: string | null;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  changed_fields: string[];
  impacted_agent_count: number;
  simulation: {
    total_events?: number;
    would_block?: number;
    inconclusive?: number;
  } | null;
}

export interface CopilotStatus {
  enabled: boolean;
  reason: string | null;
}

/** The area's REST calls; stories pass their own. */
export interface PoliciesRestClient {
  history: (policyId: string) => Promise<PolicyVersion[]>;
  diff: (policyId: string, from: number, to: number) => Promise<PolicyDiff>;
  effective: (endpointId: string) => Promise<EffectivePolicyResponse>;
  changes: (status: string) => Promise<PolicyChangeSet[]>;
  transition: (changeId: string, to: string) => Promise<{ status: string }>;
  copilotStatus: () => Promise<CopilotStatus>;
  copilotDraft: (prompt: string) => Promise<Record<string, unknown>>;
  copilotDiff: (
    policyId: string,
    draft: Record<string, unknown>,
  ) => Promise<CopilotPreview>;
  copilotStage: (
    policyId: string,
    draft: Record<string, unknown>,
  ) => Promise<{ change_id: string; status: string }>;
}

const post = (body: unknown): RequestInit => ({
  method: "POST",
  body: JSON.stringify(body),
});

export const policiesRest: PoliciesRestClient = {
  history: async (id) => {
    const body = await rest<{ results?: PolicyVersion[] } | PolicyVersion[]>(
      `/policies/${encodeURIComponent(id)}/history/`,
    );
    return Array.isArray(body) ? body : (body.results ?? []);
  },
  diff: (id, from, to) =>
    rest(`/policies/${encodeURIComponent(id)}/diff/?from=${from}&to=${to}`),
  effective: (endpointId) =>
    rest(`/effective-policy?endpoint=${encodeURIComponent(endpointId)}`),
  changes: async (status) => {
    const body = await rest<
      | { results?: PolicyChangeSet[]; changes?: PolicyChangeSet[] }
      | PolicyChangeSet[]
    >(
      `/policy-changes${status ? `?status=${encodeURIComponent(status)}` : ""}`,
    );
    return Array.isArray(body) ? body : (body.results ?? body.changes ?? []);
  },
  transition: (id, to) =>
    rest(
      `/policy-changes/${encodeURIComponent(id)}/transition`,
      post({ status: to }),
    ),
  copilotStatus: () => rest("/policy-copilot/status"),
  copilotDraft: async (prompt) =>
    (
      await rest<{ draft: Record<string, unknown> }>(
        "/policy-copilot/draft",
        post({ prompt }),
      )
    ).draft,
  copilotDiff: (policyId, draft) =>
    rest("/policy-copilot/diff", post({ policy_id: policyId, draft })),
  copilotStage: (policyId, draft) =>
    rest("/policy-copilot/stage", post({ policy_id: policyId, draft })),
};

/** A copilot draft (snake_case, as the backend writes it) as the editor's fields. */
export function draftToPolicyInput(
  draft: Record<string, unknown>,
): Partial<CreatePolicyInput> | null {
  const str = (key: string) =>
    typeof draft[key] === "string" && draft[key]
      ? (draft[key] as string)
      : undefined;
  const policyType = str("policy_type");
  if (!policyType) return null;
  return {
    policyType,
    ...(str("name") ? { name: str("name") } : {}),
    ...(str("scope_type") ? { scopeType: str("scope_type") } : {}),
    ...(str("enforcement") ? { enforcement: str("enforcement") } : {}),
    ...(str("action") ? { action: str("action") } : {}),
    ...(draft.config && typeof draft.config === "object"
      ? { config: draft.config as Record<string, unknown> }
      : {}),
  };
}

const refetchPolicies = { refetchQueries: [GET_POLICIES] };

/** Policy mutations: toggle, duplicate, delete, create and update. */
export function usePolicyWrites() {
  const t = useTranslations("policies.writes");
  const [toggle] = useMutation<{ togglePolicyEnabled: Payload }>(
    TOGGLE_POLICY_ENABLED,
    refetchPolicies,
  );
  const [duplicate] = useMutation<{
    duplicatePolicy: Payload & { policy: { id: string } | null };
  }>(DUPLICATE_POLICY, refetchPolicies);
  const [remove] = useMutation<{ deletePolicy: Payload }>(
    DELETE_POLICY,
    refetchPolicies,
  );
  const [create] = useMutation<{
    createPolicy: Payload & { policy: PolicyData | null };
  }>(CREATE_POLICY, refetchPolicies);
  const [update] = useMutation<{
    updatePolicy: Payload & { policy: PolicyData | null };
  }>(UPDATE_POLICY, { refetchQueries: [GET_POLICIES, GET_POLICY] });
  return {
    toggle: async (policy: Pick<PolicyData, "id">) => {
      const { data } = await toggle({ variables: { id: policy.id } });
      payloadOrThrow(data?.togglePolicyEnabled, t("notToggled"));
    },
    duplicate: async (policy: Pick<PolicyData, "id">) => {
      const { data } = await duplicate({ variables: { id: policy.id } });
      return payloadOrThrow(data?.duplicatePolicy, t("notDuplicated")).policy;
    },
    remove: async (policy: Pick<PolicyData, "id">) => {
      const { data } = await remove({ variables: { id: policy.id } });
      payloadOrThrow(data?.deletePolicy, t("notDeleted"));
    },
    save: async (input: CreatePolicyInput, id?: string) => {
      if (id) {
        const { data } = await update({
          variables: { input: { id, ...input } },
        });
        return payloadOrThrow(data?.updatePolicy, t("notSaved")).policy;
      }
      const { data } = await create({ variables: { input } });
      return payloadOrThrow(data?.createPolicy, t("notCreated")).policy;
    },
  };
}

const refetchRules = { refetchQueries: [GET_CONTENT_RULES] };

/** Content rule mutations, and the rule test. */
export function useContentRuleWrites() {
  const t = useTranslations("policies.writes");
  const [create] = useMutation<{ createContentRule: Payload }>(
    CREATE_CONTENT_RULE,
    refetchRules,
  );
  const [update] = useMutation<{ updateContentRule: Payload }>(
    UPDATE_CONTENT_RULE,
    refetchRules,
  );
  const [toggle] = useMutation<{ toggleContentRuleEnabled: Payload }>(
    TOGGLE_CONTENT_RULE_ENABLED,
    refetchRules,
  );
  const [remove] = useMutation<{ deleteContentRule: Payload }>(
    DELETE_CONTENT_RULE,
    refetchRules,
  );
  const [duplicate] = useMutation<{ duplicateContentRule: Payload }>(
    DUPLICATE_CONTENT_RULE,
    refetchRules,
  );
  const [test] = useMutation<{ testContentRule: TestContentRulePayload }>(
    TEST_CONTENT_RULE,
  );
  return {
    save: async (
      input: CreateContentRuleInput,
      rule: ContentRuleData | null,
    ) => {
      if (rule) {
        const { data } = await update({
          variables: { input: { id: rule.id, ...input } },
        });
        payloadOrThrow(data?.updateContentRule, t("ruleNotSaved"));
      } else {
        const { data } = await create({ variables: { input } });
        payloadOrThrow(data?.createContentRule, t("ruleNotCreated"));
      }
    },
    toggle: async (rule: ContentRuleData) => {
      const { data } = await toggle({
        variables: { id: rule.id, enabled: !rule.enabled },
      });
      payloadOrThrow(data?.toggleContentRuleEnabled, t("ruleNotToggled"));
    },
    duplicate: async (rule: ContentRuleData) => {
      const { data } = await duplicate({ variables: { id: rule.id } });
      payloadOrThrow(data?.duplicateContentRule, t("ruleNotDuplicated"));
    },
    remove: async (rule: ContentRuleData) => {
      const { data } = await remove({ variables: { id: rule.id } });
      payloadOrThrow(data?.deleteContentRule, t("ruleNotDeleted"));
    },
    test: async (rule: ContentRuleData, content: string) => {
      const { data } = await test({ variables: { id: rule.id, content } });
      return payloadOrThrow(data?.testContentRule, t("ruleNotTested"));
    },
  };
}

const refetchPrompts = { refetchQueries: [GET_SYSTEM_PROMPTS] };

/** Prompt mutations: create, update, fork, delete, analyze, and a template's text. */
export function usePromptWrites() {
  const t = useTranslations("policies.writes");
  const client = useApolloClient();
  const [create] = useMutation<{
    createSystemPrompt: Payload & { prompt: { id: string } | null };
  }>(CREATE_SYSTEM_PROMPT, refetchPrompts);
  const [update] = useMutation<{ updateSystemPrompt: Payload }>(
    UPDATE_SYSTEM_PROMPT,
    refetchPrompts,
  );
  const [fork] = useMutation<{
    forkSystemPrompt: Payload & { prompt: { id: string } | null };
  }>(FORK_SYSTEM_PROMPT, refetchPrompts);
  const [remove] = useMutation<{ deleteSystemPrompt: Payload }>(
    DELETE_SYSTEM_PROMPT,
    refetchPrompts,
  );
  const [analyze] = useMutation<AnalyzeSystemPromptData>(ANALYZE_SYSTEM_PROMPT);
  return {
    save: async (draft: PromptDraft, id?: string) => {
      if (id) {
        const { data } = await update({
          variables: {
            id,
            input: {
              name: draft.name,
              promptText: draft.promptText,
              promptType: draft.promptType,
            },
          },
        });
        payloadOrThrow(data?.updateSystemPrompt, t("promptNotSaved"));
        return id;
      }
      const { data } = await create({ variables: { input: draft } });
      const prompt = payloadOrThrow(
        data?.createSystemPrompt,
        t("promptNotCreated"),
      ).prompt;
      if (!prompt) throw new Error(t("promptNotCreated"));
      return prompt.id;
    },
    fork: async (prompt: SystemPromptData) => {
      const { data } = await fork({ variables: { id: prompt.id } });
      return payloadOrThrow(data?.forkSystemPrompt, t("promptNotForked"))
        .prompt;
    },
    remove: async (prompt: SystemPromptData) => {
      const { data } = await remove({ variables: { id: prompt.id } });
      payloadOrThrow(data?.deleteSystemPrompt, t("promptNotDeleted"));
    },
    analyze: async (
      promptText: string,
      promptType: string,
    ): Promise<AnalyzeSystemPromptResult> => {
      const { data } = await analyze({ variables: { promptText, promptType } });
      const result = data?.analyzeSystemPrompt;
      if (!result || result.success === false)
        throw new Error(result?.error || t("promptNotAnalyzed"));
      return result;
    },
    template: async (id: string) => {
      const { data } = await client.query<{
        systemPrompt: SystemPromptData | null;
      }>({ query: GET_SYSTEM_PROMPT, variables: { id } });
      return data?.systemPrompt ?? null;
    },
  };
}
