import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import type { Role } from "../../product";
import { AssistantStory } from "../../storybook/AssistantStory";
import {
  answerTurn,
  proposalTurn,
  type ChatTurn,
} from "../../storybook/fixtures/assistant";
import { narrow } from "../../storybook/viewport";
import { ShellStory } from "../../storybook/ShellStory";
import { AssistantScreen } from "./AssistantScreen";

/** The assistant's own page, at `/assistant`, in the shell. */
const meta = {
  title: "Screens/Overview/AssistantScreen",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

type Story = StoryObj;

function screen(turns: readonly ChatTurn[], role: Role = "operator"): Story {
  return {
    render: () => (
      <AssistantStory turns={turns} role={role}>
        <ShellStory path="/assistant" role={role} defaultAssistantHidden>
          <AssistantScreen />
        </ShellStory>
      </AssistantStory>
    ),
  };
}

export const Empty: Story = screen([answerTurn]);

export const Conversation: Story = {
  ...screen([answerTurn]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Which agents broke a policy today?",
    );
    await userEvent.keyboard("{Enter}");
    await expect(
      await canvas.findByText(/Two agents were blocked today/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Clear conversation" }),
    ).toBeInTheDocument();
  },
};

export const AwaitingApproval: Story = {
  ...screen([proposalTurn]),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Message" }),
      "Pause etl-runner until tomorrow.",
    );
    await userEvent.keyboard("{Enter}");
    await expect(
      await canvas.findByRole("button", { name: "Approve" }, { timeout: 4000 }),
    ).toBeInTheDocument();
  },
};

export const Narrow: Story = { ...screen([answerTurn]), ...narrow };
