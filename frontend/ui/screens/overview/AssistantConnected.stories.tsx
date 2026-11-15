import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { assistantProvidersResponse } from "../../storybook/fixtures/assistant";
import { ShellStory } from "../../storybook/ShellStory";
import { AssistantConnected } from "./AssistantConnected";

/**
 * The assistant page on `useChat`, with `GET /assistant/providers` answered
 * here. The conversation itself streams from the backend; its states are in
 * AssistantScreen.
 */
const meta = {
  title: "Screens/Overview/AssistantConnected",
  component: AssistantConnected,
  parameters: { layout: "fullscreen" },
  args: { canMutate: true },
  beforeEach: () => {
    const original = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify(assistantProvidersResponse), {
        headers: { "Content-Type": "application/json" },
      });
    return () => {
      globalThis.fetch = original;
    };
  },
  decorators: [
    (Story) => (
      <ShellStory path="/assistant" role="operator" defaultAssistantHidden>
        <Story />
      </ShellStory>
    ),
  ],
} satisfies Meta<typeof AssistantConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Ready: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByRole("option", { name: "GPT-4o" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("textbox", { name: "Message" }),
    ).toBeInTheDocument();
  },
};
