import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  endpoints,
  events,
  longEndpoints,
} from "../../storybook/fixtures/agents";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { fixtureController } from "../../storybook/table";
import { AgentActivityTab } from "./AgentActivityTab";
import { AgentDetailScreen } from "./AgentDetailScreen";
import { toAgentSummary } from "./format";

const SUPPORT = endpoints.endpoints[0];

/** One agent: the header, the summary, one row of tabs at the Astrolift deeplink paths. */
const meta = {
  title: "Screens/Agents/Agent detail",
  component: AgentDetailScreen,
  parameters: { layout: "fullscreen" },
  args: {
    agentId: SUPPORT.agentId,
    state: "ready",
    agent: toAgentSummary(SUPPORT),
    tab: "activity",
    capabilities: capabilitiesOf("admin"),
    children: (
      <AgentActivityTab table={fixtureController({ rows: events.events })} />
    ),
  },
  render: (args) => (
    <ShellStory
      path={`/agents/${args.agentId}/${args.tab}`}
      role="admin"
      defaultAssistantHidden
    >
      <AgentDetailScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AgentDetailScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tabs = within(canvas.getByRole("navigation", { name: "Agent" }));
    await expect(tabs.getByRole("link", { name: "Activity" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(
      tabs.getByRole("link", { name: "Interactions" }),
    ).toHaveAttribute("href", "/agents/agent-a-7f3c/interactions");
    await expect(
      tabs.getByRole("link", { name: "Controls" }),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { state: "loading", agent: null, children: null },
};

/** A deeplink to a slug this organization does not have. */
export const NotFound: Story = {
  args: {
    state: "notFound",
    agent: null,
    agentId: "retired-bot",
    children: null,
  },
};

export const LoadFailed: Story = {
  args: {
    state: "error",
    agent: null,
    error: { message: "Something went wrong on the server." },
    children: null,
  },
};

/** Viewers and operators do not see the admin-only Controls tab. */
export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory
      path={`/agents/${args.agentId}/activity`}
      role="viewer"
      defaultAssistantHidden
    >
      <AgentDetailScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const tabs = within(
      within(canvasElement).getByRole("navigation", { name: "Agent" }),
    );
    await expect(tabs.queryByRole("link", { name: "Controls" })).toBeNull();
    await expect(
      tabs.getByRole("link", { name: "Policies" }),
    ).toBeInTheDocument();
  },
};

/** A new agent: never heard from, no group, no owner. */
export const Sparse: Story = {
  args: {
    agent: toAgentSummary({
      ...endpoints.endpoints[2],
      lastHeartbeat: null,
      capabilities: [],
      apiKeyPrefix: null,
    }),
  },
};

export const LongData: Story = {
  args: {
    agentId: longEndpoints.endpoints[0].agentId,
    agent: {
      ...toAgentSummary(longEndpoints.endpoints[0]),
      description:
        "Routes escalations from the EMEA enterprise support queue to the right specialist team, with refunds over the approval threshold held for a person.",
      owner:
        "a.very.long.service.account.name@automation.enterprise-customer.example.com",
    },
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
      <AgentDetailScreen {...args} />
    </ShellStory>
  ),
};
