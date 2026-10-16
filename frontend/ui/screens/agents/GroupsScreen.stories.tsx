import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import type { AgentGroupData } from "@/graphql/agent-groups/types";

import { groups, longGroups } from "../../storybook/fixtures/agents";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { fixtureController } from "../../storybook/table";
import { GroupsScreen, type GroupsScreenProps } from "./GroupsScreen";

/** Groups: GetAgentGroups, with the server's search and tier filter. */
const meta = {
  title: "Screens/Agents/Groups",
  component: GroupsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    table: fixtureController<AgentGroupData>({
      rows: groups.agentGroups,
      searchEnabled: true,
    }),
    tier: "",
    onTierChange: fn(),
    capabilities: capabilitiesOf("operator"),
    onCreate: fn(),
    onEdit: fn(),
    onDelete: fn(),
  },
  render: (args) => (
    <ShellStory path="/agents/groups" role="operator" defaultAssistantHidden>
      <GroupsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof GroupsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

function table(
  overrides: Parameters<typeof fixtureController<AgentGroupData>>[0],
) {
  return fixtureController<AgentGroupData>({
    searchEnabled: true,
    ...overrides,
  });
}

export const Full: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "New group" }),
    ).toBeInTheDocument();
  },
};
export const Loading: Story = {
  args: { table: table({ state: "loading", totalCount: null }) },
};
export const Empty: Story = { args: { table: table({ state: "empty" }) } };
export const EmptyFiltered: Story = {
  args: {
    table: table({ state: "emptyFiltered", isFiltered: true, search: "legal" }),
    tier: "trusted",
  },
};
export const LoadFailed: Story = {
  args: {
    table: table({
      state: "error",
      error: { message: "Something went wrong on the server." },
    }),
  },
};
export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/agents/groups" role="viewer" defaultAssistantHidden>
      <GroupsScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "New group" }),
    ).toBeNull();
  },
};
export const LongData: Story = {
  args: { table: table({ rows: longGroups.agentGroups }) },
};
export const Narrow: Story = {
  ...narrow,
  render: (args: GroupsScreenProps) => (
    <ShellStory path="/agents/groups" role="operator" defaultAssistantHidden>
      <GroupsScreen {...args} />
    </ShellStory>
  ),
};
