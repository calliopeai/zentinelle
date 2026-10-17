import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { endpoints } from "../../storybook/fixtures/agents";
import {
  budgetPolicy,
  longPolicy,
  policyOptions,
} from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  PolicyEditorScreen,
  type PolicyEditorScreenProps,
  type PolicySource,
} from "./PolicyEditorScreen";
import { NARROW, resolved } from "./story-helpers";

function Story(
  props: Partial<PolicyEditorScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [source, setSource] = React.useState<PolicySource>(
    rest.source ?? "blank",
  );
  return (
    <ShellStory
      path={
        rest.policy ? `/policies/${rest.policy.id}/edit` : "/policies/create"
      }
      role={role}
      defaultAssistantHidden
    >
      <PolicyEditorScreen
        capabilities={capabilitiesOf(role)}
        options={policyOptions.policyOptions}
        optionsLoading={false}
        onRetry={fn()}
        agents={endpoints.endpoints.map((e) => ({ id: e.id, name: e.name }))}
        onDraftFromDocument={fn(async () => ({
          name: "Outbound allowlist from the security standard",
          policyType: "network_policy",
          config: {
            allowed_outbound_domains: ["api.openai.com"],
            block_public_internet: true,
          },
        }))}
        onSubmit={resolved()}
        cancelHref="/policies"
        {...rest}
        source={source}
        onSourceChange={setSource}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Policy editor",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const New: S = { render: () => <Story /> };

export const NewValidation: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Create policy" }),
    );
    await expect(canvas.getByText("A name is required.")).toBeInTheDocument();
  },
};

export const NewSaves: S = {
  render: () => <Story onSubmit={fn(async () => true)} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Name" }),
      "Org spend cap",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create policy" }),
    );
    await expect(canvas.queryByText("A name is required.")).toBeNull();
  },
};

export const ServerRefuses: S = {
  render: () => (
    <Story
      onSubmit={fn(async () => {
        throw new globalThis.Error(
          "A policy named Org spend cap already exists.",
        );
      })}
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Name" }),
      "Org spend cap",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Create policy" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  },
};

export const FromDocument: S = {
  render: () => <Story source="document" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Policy document" }),
      "Agents may only call approved APIs.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Draft the policy" }),
    );
    await expect(
      await canvas.findByDisplayValue(
        "Outbound allowlist from the security standard",
      ),
    ).toBeInTheDocument();
  },
};

export const FromDocumentUnreadable: S = {
  render: () => (
    <Story source="document" onDraftFromDocument={fn(async () => null)} />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Policy document" }),
      "Lunch is at noon.",
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Draft the policy" }),
    );
    await expect(await canvas.findByRole("status")).toHaveTextContent(
      "Nothing in the document",
    );
  },
};

export const Edit: S = { render: () => <Story policy={budgetPolicy} /> };
export const EditLong: S = { render: () => <Story policy={longPolicy} /> };
export const Loading: S = {
  render: () => <Story options={null} optionsLoading />,
};
export const Error: S = {
  render: () => (
    <Story
      options={null}
      optionsError={{ message: "Something went wrong on the server." }}
    />
  ),
};
/** A viewer who follows a link to New policy gets the reason, not a form that would fail. */
export const Viewer: S = { render: () => <Story role="viewer" /> };
export const Narrow: S = {
  ...NARROW,
  render: () => <Story policy={budgetPolicy} />,
};
