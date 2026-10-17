import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import {
  NARROW,
  defaultRuntime,
  longRuntime,
  runtime,
} from "../../storybook/fixtures/settings";
import { ShellStory } from "../../storybook/ShellStory";
import { AssistantScreen } from "./AssistantScreen";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

const meta = {
  title: "Settings/Screens/Assistant",
  component: AssistantScreen,
  parameters: { layout: "fullscreen" },
  args: {
    runtime: { data: runtime },
    actions: {
      onStage: fn(async () => {}),
      onTransition: fn(async () => {}),
      onRollback: fn(async () => {}),
    },
  },
  render: (args) => (
    <ShellStory path="/settings/assistant" defaultAssistantHidden>
      <AssistantScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AssistantScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Configured: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Assistant" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByDisplayValue("qwen3-32b-instruct"),
    ).toBeInTheDocument();
  },
};

export const SharedModel: Story = {
  args: { runtime: { data: defaultRuntime } },
};

export const Loading: Story = {
  args: { runtime: { data: null, loading: true } },
};

export const Failed: Story = {
  args: {
    runtime: { data: null, error: { message: "Network error" }, retry: fn() },
  },
};

export const LongData: Story = { args: { runtime: { data: longRuntime } } };

export const Narrow: Story = { ...NARROW };

export const Viewer: Story = {
  render: () => (
    <ShellStory path="/settings/assistant" role="viewer" defaultAssistantHidden>
      <SettingsForbiddenScreen title="Assistant" />
    </ShellStory>
  ),
};
