// @vitest-environment jsdom
import { MockedProvider } from "@apollo/client/testing/react";
import type { MockLink } from "@apollo/client/testing";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  CREATE_SYSTEM_PROMPT,
  UPDATE_SYSTEM_PROMPT,
} from "@/graphql/prompts/mutations";
import {
  GET_SYSTEM_PROMPT,
  GET_SYSTEM_PROMPTS,
} from "@/graphql/prompts/queries";

import PromptBuilderPage from "./page";

const nav = vi.hoisted(() => ({ push: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(nav.search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const ID = "6f1c2b9e-0d4a-4b8e-9a51-3c2f7a1d5e10";
const ORIGINAL = "You review pull requests for correctness and tests.";
const EDITED = "You review pull requests for correctness, tests and security.";

const storedPrompt = {
  __typename: "SystemPromptType",
  id: ID,
  name: "Code review assistant",
  slug: "code-review-assistant",
  description: "",
  promptType: "system",
  promptTypeDisplay: "System Prompt",
  category: null,
  compatibleProviders: [],
  templateVariables: [],
  recommendedTemperature: null,
  version: 1,
  status: "draft",
  statusDisplay: "Draft",
  visibility: "organization",
  visibilityDisplay: "Organization",
  isFeatured: false,
  isVerified: false,
  usageCount: 0,
  favoriteCount: 0,
  avgRating: null,
  tags: [],
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  createdByUsername: "leo",
  promptText: ORIGINAL,
  compatibleModels: [],
  recommendedMaxTokens: null,
  exampleInput: "",
  exampleOutput: "",
  useCases: [],
};

// The prompt as the builder loads it, and the two queries the update
// refetches so the list and the detail view show the saved text.
const loadAndRefetch: MockLink.MockedResponse[] = [
  {
    request: { query: GET_SYSTEM_PROMPT, variables: { id: ID } },
    result: { data: { systemPrompt: storedPrompt } },
    maxUsageCount: 2,
  },
  {
    request: { query: GET_SYSTEM_PROMPTS },
    result: { data: { systemPrompts: [] } },
  },
];

function updateMock(payload: Record<string, unknown>): MockLink.MockedResponse {
  return {
    request: {
      query: UPDATE_SYSTEM_PROMPT,
      variables: {
        id: ID,
        input: { name: "Code review assistant", promptText: EDITED },
      },
    },
    result: {
      data: {
        updateSystemPrompt: {
          __typename: "UpdateSystemPromptPayload",
          ...payload,
        },
      },
    },
  };
}

beforeEach(() => {
  nav.search = "";
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function editor() {
  return screen.getByPlaceholderText<HTMLTextAreaElement>(
    /Start typing your prompt here/,
  );
}

describe("the prompt builder", () => {
  it("edits the prompt named by ?id= and saves it as an update", async () => {
    nav.search = `id=${ID}`;
    render(
      <MockedProvider
        mocks={[
          ...loadAndRefetch,
          updateMock({
            success: true,
            errors: [],
            prompt: {
              __typename: "SystemPromptDjangoType",
              id: ID,
              name: "Code review assistant",
            },
          }),
        ]}
      >
        <PromptBuilderPage />
      </MockedProvider>,
    );

    await screen.findByRole("heading", { name: "Edit Prompt" });
    expect(editor().value).toBe(ORIGINAL);

    fireEvent.change(editor(), { target: { value: EDITED } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    expect(screen.getByLabelText<HTMLInputElement>("Prompt name").value).toBe(
      "Code review assistant",
    );
    fireEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith("/system-prompts"),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Prompt "Code review assistant" updated',
    );
    expect(toast.error).not.toHaveBeenCalled();
  });

  it("keeps the dialog open with the reason when the update is refused", async () => {
    nav.search = `id=${ID}`;
    render(
      <MockedProvider
        mocks={[
          ...loadAndRefetch,
          updateMock({
            success: false,
            errors: ["Permission denied"],
            prompt: null,
          }),
        ]}
      >
        <PromptBuilderPage />
      </MockedProvider>,
    );

    await screen.findByRole("heading", { name: "Edit Prompt" });
    fireEvent.change(editor(), { target: { value: EDITED } });
    fireEvent.click(screen.getByRole("button", { name: "Save Changes" }));
    fireEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    expect(await screen.findByText("Permission denied")).toBeTruthy();
    expect(toast.error).toHaveBeenCalledWith("Permission denied");
    expect(nav.push).not.toHaveBeenCalled();
  });

  it("says so when the prompt does not exist", async () => {
    nav.search = `id=${ID}`;
    render(
      <MockedProvider
        mocks={[
          {
            request: { query: GET_SYSTEM_PROMPT, variables: { id: ID } },
            result: { data: { systemPrompt: null } },
          },
        ]}
      >
        <PromptBuilderPage />
      </MockedProvider>,
    );

    expect(await screen.findByText("Prompt not found")).toBeTruthy();
    expect(screen.queryByPlaceholderText(/Start typing/)).toBeNull();
  });

  it("still creates a new prompt without ?id=", async () => {
    const text = "You summarise incident timelines for reviewers.";
    render(
      <MockedProvider
        mocks={[
          {
            request: {
              query: CREATE_SYSTEM_PROMPT,
              variables: {
                input: {
                  name: "Incident summary",
                  promptText: text,
                  promptType: "system",
                  visibility: "organization",
                },
              },
            },
            result: {
              data: {
                createSystemPrompt: {
                  __typename: "CreateSystemPromptPayload",
                  errors: [],
                  prompt: {
                    __typename: "SystemPromptDjangoType",
                    id: "0b6c7a43-9a1e-4d5b-8f2c-1e3d4c5b6a79",
                    name: "Incident summary",
                    slug: "incident-summary",
                    description: "",
                    promptType: "system",
                    visibility: "organization",
                    createdAt: "2026-10-16T00:00:00Z",
                  },
                },
              },
            },
          },
        ]}
      >
        <PromptBuilderPage />
      </MockedProvider>,
    );

    expect(
      screen.getByRole("heading", { name: "Prompt Builder" }),
    ).toBeTruthy();
    fireEvent.change(editor(), { target: { value: text } });
    fireEvent.click(
      screen.getByRole("button", { name: "Save as System Prompt" }),
    );
    fireEvent.change(screen.getByLabelText("Prompt name"), {
      target: { value: "Incident summary" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save prompt" }));

    await waitFor(() =>
      expect(nav.push).toHaveBeenCalledWith("/system-prompts"),
    );
    expect(toast.success).toHaveBeenCalledWith(
      'Prompt "Incident summary" saved',
    );
  });
});
