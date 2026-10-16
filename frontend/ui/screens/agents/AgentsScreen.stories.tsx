import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { agentRows, longAgentRows } from "../../storybook/fixtures/agents";
import { fixtureController } from "../../storybook/table";
import { AgentsScreen, type AgentsScreenProps } from "./AgentsScreen";
import type { AgentRow } from "./format";

/** Agents: the list, every state. Rows link to the agent's page at its Astrolift deeplink path. */
const meta = {
  title: "Screens/Agents/Agents",
  component: AgentsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    table: fixtureController<AgentRow>({
      rows: agentRows,
      searchEnabled: true,
    }),
    filters: { status: "", agentType: "" },
    onFiltersChange: fn(),
    capabilities: capabilitiesOf("operator"),
    onRegister: fn(),
    onEdit: fn(),
    onAssignGroup: fn(),
    onSuspend: fn(),
    onActivate: fn(),
    onRegenerateKey: fn(),
    onDelete: fn(),
  },
  render: (args) => (
    <ShellStory path="/agents" role="operator" defaultAssistantHidden>
      <AgentsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AgentsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

function table(overrides: Parameters<typeof fixtureController<AgentRow>>[0]) {
  return fixtureController<AgentRow>({ searchEnabled: true, ...overrides });
}

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: /support-bot/ }),
    ).toHaveAttribute("href", "/agents/agent-a-7f3c");
    await expect(
      canvas.getByRole("button", { name: "Register agent" }),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  args: { table: table({ state: "loading", totalCount: null }) },
};

export const Empty: Story = { args: { table: table({ state: "empty" }) } };

export const EmptyFiltered: Story = {
  args: {
    table: table({
      state: "emptyFiltered",
      search: "billing",
      isFiltered: true,
    }),
    filters: { status: "suspended", agentType: "" },
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

/** A viewer reads: no Register, no row menu. */
export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/agents" role="viewer" defaultAssistantHidden>
      <AgentsScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Register agent" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /Actions for/ }),
    ).toBeNull();
  },
};

export const ViewerEmpty: Story = {
  ...Viewer,
  args: {
    capabilities: capabilitiesOf("viewer"),
    table: table({ state: "empty" }),
  },
  play: undefined,
};

export const LongData: Story = {
  args: { table: table({ rows: longAgentRows }) },
};

/** More than one page: the pager moves through what the query returned. */
export const Paged: Story = {
  args: {
    table: table({
      rows: agentRows,
      totalCount: 30,
      hasNext: true,
      pageSize: 4,
    }),
  },
};

export const Narrow: Story = {
  ...narrow,
  render: (args: AgentsScreenProps) => (
    <ShellStory path="/agents" role="operator" defaultAssistantHidden>
      <AgentsScreen {...args} />
    </ShellStory>
  ),
};

/** Filters are the query's variables: the route refetches on change. */
export const FilterByStatus: Story = {
  play: async ({ canvasElement, args }) => {
    const select = within(canvasElement).getByRole("combobox", {
      name: "Status",
    });
    await userEvent.selectOptions(select, "suspended");
    await expect(args.onFiltersChange).toHaveBeenCalledWith({
      status: "suspended",
      agentType: "",
    });
  },
};
