import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  control,
  detailMocks,
  effectivePolicies,
  searchMocks,
  toolPermissions,
} from "../../storybook/fixtures/agents";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { AgentDetailRoute, type AgentRestClient } from "./AgentDetailRoute";
import type { AgentTab } from "./AgentDetailScreen";

const client: AgentRestClient = {
  control: async () => ({ denied: false, data: control }),
  act: async () => {},
  effective: async () => ({
    policies: effectivePolicies,
    tools: toolPermissions,
  }),
};

const failing: AgentRestClient = {
  control: async () => {
    throw new Error("Controls could not be loaded.");
  },
  act: async () => {},
  effective: async () => {
    throw new Error("Policies could not be loaded.");
  },
};

/**
 * An agent's page as `app/(app)/agents/[agentId]/{tab}` will mount it: the
 * deeplink slug resolved through GetEndpoints, then only the open tab's
 * query (GetEvents, GetInteractionLogs, GetUsageMetrics,
 * GetContentViolations, or the two REST reads).
 */
const meta = {
  title: "Screens/Agents/Routes/Agent detail",
  component: AgentDetailRoute,
  parameters: { layout: "fullscreen", graphql: { mocks: detailMocks.full } },
  args: {
    agentId: "agent-a-7f3c",
    tab: "activity",
    capabilities: capabilitiesOf("admin"),
    client,
  },
  render: (args) => (
    <ShellStory
      path={`/agents/${args.agentId}/${args.tab}`}
      role="admin"
      defaultAssistantHidden
    >
      <AgentDetailRoute {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AgentDetailRoute>;
export default meta;

type Story = StoryObj<typeof meta>;

function tab(name: AgentTab, check?: RegExp): Story {
  return {
    args: { tab: name },
    play: check
      ? async ({ canvasElement }) => {
          await expect(
            await within(canvasElement).findByText(check),
          ).toBeInTheDocument();
        }
      : undefined,
  };
}

export const Activity = tab("activity", /policy violation/);
export const Interactions = tab("interactions", /gpt-5/);
export const Usage = tab("usage", /18,240/);
export const Compliance = tab("compliance", /Jailbreak phrases/);
export const Controls = tab("controls", /openai\/gpt-5-mini/);
export const Policies = tab("policies", /Organization guardrails/);

export const EmptyTabs: Story = {
  parameters: { graphql: { mocks: detailMocks.empty } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("No events yet"),
    ).toBeInTheDocument();
  },
};

export const UsageEmpty: Story = {
  ...tab("usage", /No usage recorded/),
  parameters: { graphql: { mocks: detailMocks.empty } },
};

export const AgentLoading: Story = {
  parameters: { graphql: { mocks: detailMocks.loading } },
};
export const TabLoading: Story = {
  parameters: { graphql: { mocks: detailMocks.tabLoading } },
};

export const AgentFailed: Story = {
  parameters: { graphql: { mocks: detailMocks.error } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Could not load the agent"),
    ).toBeInTheDocument();
  },
};

export const TabFailed: Story = {
  args: { tab: "interactions" },
  parameters: { graphql: { mocks: detailMocks.tabError } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/went wrong/),
    ).toBeInTheDocument();
  },
};

export const RestFailed: Story = {
  args: { tab: "policies", client: failing },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/Policies could not be loaded/),
    ).toBeInTheDocument();
  },
};

/** An Astrolift deeplink to a slug this organization does not have. */
export const NotFound: Story = {
  args: { agentId: "retired-bot" },
  parameters: { graphql: { mocks: detailMocks.notFound } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Agent not found"),
    ).toBeInTheDocument();
  },
};

/** A viewer opening the Controls path gets the admin notice, not an empty page. */
export const ViewerControls: Story = {
  args: { tab: "controls", capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory
      path={`/agents/${args.agentId}/controls`}
      role="viewer"
      defaultAssistantHidden
    >
      <AgentDetailRoute {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Controls need an administrator"),
    ).toBeInTheDocument();
  },
};

export const LongData: Story = {
  args: {
    agentId:
      "customer-support-escalation-router-for-the-emea-enterprise-tier-with-a-very-long-name",
  },
  parameters: {
    graphql: { mocks: [...searchMocks.long, ...detailMocks.full.slice(1)] },
  },
};

export const Narrow: Story = {
  ...narrow,
  render: (args) => (
    <ShellStory
      path={`/agents/${args.agentId}/${args.tab}`}
      role="admin"
      defaultAssistantHidden
    >
      <AgentDetailRoute {...args} />
    </ShellStory>
  ),
};
