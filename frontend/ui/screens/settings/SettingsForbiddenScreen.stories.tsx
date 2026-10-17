import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { NARROW } from "../../storybook/fixtures/settings";
import { ShellStory } from "../../storybook/ShellStory";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

const meta = {
  title: "Settings/Screens/Forbidden",
  component: SettingsForbiddenScreen,
  parameters: { layout: "fullscreen" },
  args: { title: "General" },
} satisfies Meta<typeof SettingsForbiddenScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A viewer follows a bookmark to /settings: the nav has no Settings area, and the page says why. */
export const Viewer: Story = {
  render: (args) => (
    <ShellStory path="/settings" role="viewer" defaultAssistantHidden>
      <SettingsForbiddenScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByText("Settings need the admin role"),
    ).toBeInTheDocument();
    await expect(
      canvas.queryByRole("link", { name: "API keys" }),
    ).not.toBeInTheDocument();
  },
};

export const Operator: Story = {
  args: { title: "API keys" },
  render: (args) => (
    <ShellStory
      path="/settings/api-keys"
      role="operator"
      defaultAssistantHidden
    >
      <SettingsForbiddenScreen {...args} />
    </ShellStory>
  ),
};

export const Narrow: Story = { ...Viewer, ...NARROW, play: undefined };
