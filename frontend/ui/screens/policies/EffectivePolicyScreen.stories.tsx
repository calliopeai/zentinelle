import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, within } from "storybook/test";

import { endpoints } from "../../storybook/fixtures/agents";
import {
  effectiveNone,
  effectivePolicy,
} from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  EffectivePolicyScreen,
  type EffectivePolicyScreenProps,
} from "./EffectivePolicyScreen";
import { NARROW } from "./story-helpers";

const AGENTS = endpoints.endpoints.map((e) => ({ id: e.id, name: e.name }));

function Story(
  props: Partial<EffectivePolicyScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [agentId, setAgentId] = React.useState(rest.agentId ?? "a-7f3c");
  return (
    <ShellStory path="/policies/effective" role={role} defaultAssistantHidden>
      <EffectivePolicyScreen
        capabilities={capabilitiesOf(role)}
        agents={AGENTS}
        agentsLoading={false}
        effective={effectivePolicy}
        loading={false}
        onRetry={fn()}
        {...rest}
        agentId={agentId}
        onAgentChange={setAgentId}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Effective",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Full: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Policies in effect" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Refunds need a person" }),
    ).toBeInTheDocument();
  },
};
export const NoAgentChosen: S = {
  render: () => <Story agentId="" effective={null} />,
};
export const LoadingAgents: S = {
  render: () => <Story agents={[]} agentsLoading agentId="" effective={null} />,
};
export const Loading: S = { render: () => <Story effective={null} loading /> };
export const NoAgents: S = {
  render: () => <Story agents={[]} agentId="" effective={null} />,
};
/** The agent exists, but no policy reaches it. */
export const Empty: S = { render: () => <Story effective={effectiveNone} /> };
export const Error: S = {
  render: () => (
    <Story
      effective={null}
      error={{ message: "effective-policy: endpoint not found." }}
    />
  ),
};
export const Viewer: S = { render: () => <Story role="viewer" /> };
export const LongData: S = {
  render: () => (
    <Story
      effective={{
        ...effectivePolicy,
        resolved: {
          ...effectivePolicy.resolved,
          system_prompt: "You are the Example Co support assistant. ".repeat(
            40,
          ),
          tool_permissions: {
            allowed: Array.from(
              { length: 40 },
              (_, i) => `tool_with_a_long_name_${i}`,
            ),
            denied: ["shell", "filesystem_write"],
            requires_approval: ["issue_refund"],
          },
        },
      }}
    />
  ),
};
export const Narrow: S = { ...NARROW, render: () => <Story /> };
