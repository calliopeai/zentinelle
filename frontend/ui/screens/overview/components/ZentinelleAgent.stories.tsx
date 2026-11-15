import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";

import { AssistantStory } from "../../../storybook/AssistantStory";
import {
  answerTurn,
  deniedTurn,
  longTurn,
  proposalTurn,
  type ChatTurn,
} from "../../../storybook/fixtures/assistant";
import type { Role } from "../../../product";
import { ZentinelleAgent } from "./ZentinelleAgent";

/**
 * Zentinelle AI on the library's CalliopeAgent, over the app's adapter of
 * `/assistant/chat` and recorded turns: the answer with its tools and page
 * links, an approval, the guardrail's refusal.
 */
const meta = {
  title: "Screens/Overview/Components/ZentinelleAgent",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;

type Story = StoryObj;

function inline(turns: readonly ChatTurn[], role: Role = "operator"): Story {
  return {
    render: () => (
      <AssistantStory turns={turns} role={role}>
        <div className="flex h-[36rem] flex-col p-4">
          <ZentinelleAgent mode="inline" className="min-h-0 flex-1" />
        </div>
      </AssistantStory>
    ),
  };
}

async function ask(canvasElement: HTMLElement, text: string) {
  const canvas = within(canvasElement);
  await userEvent.type(canvas.getByRole("textbox", { name: "Message" }), text);
  await userEvent.keyboard("{Enter}");
  return canvas;
}

/** The floating bubble, closed: the launcher in the corner. */
export const Bubble: Story = {
  render: () => (
    <AssistantStory turns={[answerTurn]}>
      <ZentinelleAgent mode="bubble" />
    </AssistantStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: /Zentinelle AI/ }),
    ).toBeInTheDocument();
  },
};

/** Before anything is said: the welcome. */
export const Empty: Story = inline([answerTurn]);

/** An answer with the tool it used, its result and a page to go to. */
export const Answer: Story = {
  ...inline([answerTurn]),
  play: async ({ canvasElement }) => {
    const canvas = await ask(
      canvasElement,
      "Which agents broke a policy today?",
    );
    await expect(
      await canvas.findByText(/Two agents were blocked today/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Events" })).toHaveAttribute(
      "href",
      "/events",
    );
  },
};

/** An operator approves what the assistant proposed; it runs as them and the card says how it ended. */
export const Approval: Story = {
  ...inline([proposalTurn]),
  play: async ({ canvasElement }) => {
    const canvas = await ask(canvasElement, "Pause etl-runner until tomorrow.");
    await userEvent.click(
      await canvas.findByRole("button", { name: "Approve" }, { timeout: 4000 }),
    );
    await waitFor(() =>
      expect(canvas.getByText("completed")).toBeInTheDocument(),
    );
  },
};

/** A viewer sees the proposal but not the buttons. */
export const ApprovalForViewer: Story = {
  ...inline([proposalTurn], "viewer"),
  play: async ({ canvasElement }) => {
    const canvas = await ask(canvasElement, "Pause etl-runner until tomorrow.");
    await expect(
      await canvas.findByText(
        "An operator or admin can approve this.",
        undefined,
        {
          timeout: 4000,
        },
      ),
    ).toBeInTheDocument();
    await expect(canvas.queryByRole("button", { name: "Approve" })).toBeNull();
  },
};

/** The output guardrail stopped the answer: the run fails with its words. */
export const GuardrailDenied: Story = {
  ...inline([deniedTurn]),
  play: async ({ canvasElement }) => {
    const canvas = await ask(
      canvasElement,
      "Who is the customer on ticket 42?",
    );
    await expect(
      await canvas.findByText(/names a customer|named a customer/, undefined, {
        timeout: 4000,
      }),
    ).toBeInTheDocument();
  },
};

/** A long answer scrolls in place. */
export const Long: Story = {
  ...inline([longTurn]),
  play: async ({ canvasElement }) => {
    const canvas = await ask(canvasElement, "Summarize every compliance gap.");
    await expect(
      await canvas.findByText(/Gap 12\./, undefined, { timeout: 4000 }),
    ).toBeInTheDocument();
  },
};
