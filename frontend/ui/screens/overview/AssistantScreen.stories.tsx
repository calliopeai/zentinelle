import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import type { Role } from "../../product";
import {
  assistantModels,
  conversation,
  longConversation,
  pendingApproval,
  streaming,
} from "../../storybook/fixtures/assistant";
import { narrow } from "../../storybook/viewport";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { AssistantScreen, type AssistantScreenProps } from "./AssistantScreen";

/** The assistant's own page, at `/assistant`, in the shell. */
const meta = {
  title: "Screens/Overview/AssistantScreen",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

type Story = StoryObj;

function screen(
  props: Partial<AssistantScreenProps>,
  role: Role = "operator",
): Story {
  return {
    render: () => (
      <ShellStory path="/assistant" role={role} defaultAssistantHidden>
        <AssistantScreen
          messages={conversation}
          isStreaming={false}
          models={assistantModels}
          model="claude-sonnet-4-20250514"
          onModelChange={fn()}
          onSend={fn()}
          onStop={fn()}
          onClear={fn()}
          canMutate={capabilitiesOf(role).includes("mutate")}
          onApprove={fn()}
          onReject={fn()}
          {...props}
        />
      </ShellStory>
    ),
  };
}

export const Empty: Story = {
  ...screen({ messages: [] }),
  play: async ({ canvasElement }) => {
    const main = within(within(canvasElement).getByRole("main"));
    await expect(
      main.getByRole("heading", { level: 1, name: "Assistant" }),
    ).toBeInTheDocument();
    await expect(
      main.queryByRole("button", { name: "Clear conversation" }),
    ).not.toBeInTheDocument();
  },
};

export const Conversation: Story = {
  ...screen({}),
  play: async ({ canvasElement }) => {
    const main = within(within(canvasElement).getByRole("main"));
    await expect(
      main.getByRole("button", { name: "Clear conversation" }),
    ).toBeEnabled();
    // The Overview row stays current on its sub-page.
    await expect(
      within(canvasElement).getByRole("link", { name: "Overview" }),
    ).toHaveAttribute("aria-current", "page");
  },
};

export const Streaming = screen({ messages: streaming, isStreaming: true });

export const Failed: Story = {
  ...screen({
    error: "Connection failed. Check that the backend is running.",
  }),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("alert")).toHaveTextContent(
      "Connection failed",
    );
  },
};

export const PendingApproval = screen({ messages: pendingApproval });

export const ViewerPendingApproval = screen(
  { messages: pendingApproval },
  "viewer",
);

export const LoadingModels = screen({ models: [], modelsLoading: true });

export const LongData = screen({ messages: longConversation });

export const Narrow: Story = { ...screen({}), ...narrow };
