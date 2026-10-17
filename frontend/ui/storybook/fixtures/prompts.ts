/** The prompt library: `GetSystemPrompts` and `GetSystemPrompt` (graphql/prompts/queries.ts), and `AnalyzeSystemPrompt`'s result. */
import {
  GET_SYSTEM_PROMPT,
  GET_SYSTEM_PROMPTS,
} from "@/graphql/prompts/queries";
import type {
  AnalyzeSystemPromptResult,
  SystemPromptData,
  SystemPromptDetailData,
  SystemPromptListData,
} from "@/graphql/prompts/types";

import { mockError, mockLoading, mockQuery } from "../graphql";

// The list query selects the shared fields; the detail query adds the text
// and examples. A list fixture leaves the detail-only fields out, or the
// cache would hold data the list never returns.
type ListPrompt = Omit<
  SystemPromptData,
  | "promptText"
  | "compatibleModels"
  | "recommendedMaxTokens"
  | "exampleInput"
  | "exampleOutput"
  | "useCases"
>;

const SUPPORT = {
  id: "cat-support",
  name: "Customer support",
  slug: "customer-support",
  description: null,
};

function listPrompt(
  overrides: Partial<ListPrompt> & Pick<ListPrompt, "id" | "name">,
): ListPrompt {
  return {
    slug: overrides.id,
    description: null,
    promptType: "system",
    promptTypeDisplay: "System Prompt",
    category: SUPPORT,
    compatibleProviders: ["anthropic", "openai"],
    templateVariables: [],
    recommendedTemperature: 0.3,
    version: 1,
    status: "active",
    statusDisplay: "Active",
    visibility: "organization",
    visibilityDisplay: "Organization",
    isFeatured: false,
    isVerified: false,
    usageCount: 0,
    favoriteCount: 0,
    avgRating: null,
    tags: [],
    createdAt: "2026-09-02T10:00:00Z",
    updatedAt: "2026-10-14T09:12:00Z",
    createdByUsername: "leo@calliope.ai",
    ...overrides,
  };
}

export const prompts = [
  listPrompt({
    id: "p-support",
    name: "Support agent",
    description: "Friendly, cites the knowledge base, never promises refunds.",
    templateVariables: ["company", "tone"],
    usageCount: 1204,
    isFeatured: true,
    isVerified: true,
    version: 4,
  }),
  listPrompt({
    id: "p-triage",
    name: "Ticket triage",
    promptType: "task",
    promptTypeDisplay: "Task Template",
    usageCount: 310,
  }),
  listPrompt({
    id: "p-safety",
    name: "Safety preamble",
    promptType: "safety",
    promptTypeDisplay: "Safety/Guardrails",
    isFeatured: true,
    category: null,
    usageCount: 88,
  }),
  listPrompt({
    id: "p-draft",
    name: "Release notes writer",
    status: "draft",
    statusDisplay: "Draft",
    visibility: "private",
    visibilityDisplay: "Private",
  }),
] as SystemPromptData[];

export const longPrompt = listPrompt({
  id: "p-long",
  name: "A persona for the refunds and billing escalation agent that handles disputes across every region and currency",
  description:
    "Explains the dispute process step by step, collects the order number and the reason, and hands off to a person whenever the amount is over the threshold or the customer asks for one. ".repeat(
      2,
    ),
  promptType: "persona",
  promptTypeDisplay: "Persona/Role",
  templateVariables: Array.from(
    { length: 12 },
    (_, i) => `variable_with_a_long_name_${i}`,
  ),
  createdByUsername: "platform-automation-service-account@security.example.com",
}) as SystemPromptData;

export const manyPrompts = [
  ...prompts,
  longPrompt,
  ...Array.from({ length: 30 }, (_, i) =>
    listPrompt({
      id: `p-gen-${i}`,
      name: `Template ${i + 1}`,
      promptType: "task",
      promptTypeDisplay: "Task Template",
    }),
  ),
] as SystemPromptData[];

export const promptDetail: SystemPromptData = {
  ...prompts[0],
  promptText:
    "You are the {{company}} support assistant. Answer in a {{tone}} tone.\n\nUse only the knowledge base. If the answer is not there, say so and open a ticket.\n\nNever promise a refund; explain the process instead.",
  compatibleModels: ["claude-sonnet-4-5", "gpt-5"],
  recommendedMaxTokens: 1024,
  exampleInput: "Where is my order?",
  exampleOutput: "I can check that for you. What is the order number?",
  useCases: ["support"],
};

export const analysis: AnalyzeSystemPromptResult = {
  success: true,
  overallScore: 78,
  strengths: [
    "States what to do when the answer is unknown.",
    "Names a forbidden action explicitly.",
  ],
  improvements: [
    {
      category: "clarity",
      originalText: "Answer in a {{tone}} tone.",
      suggestedText:
        "Answer in a {{tone}} tone, in at most three short paragraphs.",
      explanation: "A length limit keeps answers scannable.",
      severity: "low",
    },
  ],
  tokenEfficiency: "good",
  error: null,
};

export const promptsMocks = {
  full: [
    mockQuery(GET_SYSTEM_PROMPTS, {
      systemPrompts: prompts,
    } satisfies SystemPromptListData),
  ],
  empty: [
    mockQuery(GET_SYSTEM_PROMPTS, {
      systemPrompts: [],
    } satisfies SystemPromptListData),
  ],
  loading: [mockLoading(GET_SYSTEM_PROMPTS)],
  error: [mockError(GET_SYSTEM_PROMPTS)],
};

export const promptMocks = {
  full: [
    mockQuery(GET_SYSTEM_PROMPT, {
      systemPrompt: promptDetail,
    } satisfies SystemPromptDetailData),
  ],
  missing: [
    mockQuery(GET_SYSTEM_PROMPT, {
      systemPrompt: null,
    } satisfies SystemPromptDetailData),
  ],
  loading: [mockLoading(GET_SYSTEM_PROMPT)],
  error: [mockError(GET_SYSTEM_PROMPT)],
};
