import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";

import { GET_AGENT_GROUPS } from "@/graphql/agent-groups/queries";

import {
  createGroupMocks,
  groupsMocks,
  longGroups,
} from "../../storybook/fixtures/agents";
import { mockQuery } from "../../storybook/graphql";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { GroupsRoute } from "./GroupsRoute";

/** The Groups route: GetAgentGroups and the group mutations, answered by the story mocks. */
const meta = {
  title: "Screens/Agents/Routes/Groups",
  component: GroupsRoute,
  parameters: { layout: "fullscreen", graphql: { mocks: groupsMocks.full } },
  args: { capabilities: capabilitiesOf("operator") },
  render: (args) => (
    <ShellStory path="/agents/groups" role="operator" defaultAssistantHidden>
      <GroupsRoute {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof GroupsRoute>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Internal tools"),
    ).toBeInTheDocument();
  },
};
export const Loading: Story = {
  parameters: { graphql: { mocks: groupsMocks.loading } },
};
export const Empty: Story = {
  parameters: { graphql: { mocks: groupsMocks.empty } },
};
export const LoadFailed: Story = {
  parameters: { graphql: { mocks: groupsMocks.error } },
};
export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/agents/groups" role="viewer" defaultAssistantHidden>
      <GroupsRoute {...args} />
    </ShellStory>
  ),
};
export const LongData: Story = {
  parameters: { graphql: { mocks: [mockQuery(GET_AGENT_GROUPS, longGroups)] } },
};

/** CreateAgentGroup answered `errors`: the dialog shows them and stays open. */
export const CreateRefused: Story = {
  parameters: {
    graphql: { mocks: [...groupsMocks.full, createGroupMocks.refused] },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", { name: "New group" }),
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "Finance",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  },
};

export const Narrow: Story = {
  ...narrow,
  render: (args) => (
    <ShellStory path="/agents/groups" role="operator" defaultAssistantHidden>
      <GroupsRoute {...args} />
    </ShellStory>
  ),
};
