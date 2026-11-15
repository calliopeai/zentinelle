import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { AssistantStory } from "../../../storybook/AssistantStory";
import { proposalTurn } from "../../../storybook/fixtures/assistant";
import { APPROVAL, type ActionOutcome } from "@/lib/assistant/agent";
import {
  ActionResult,
  ApprovalCard,
  MarkdownContent,
  NavigationChip,
} from "./AssistantParts";

/** The assistant's own pieces inside the library's conversation. */
const meta = {
  title: "Screens/Overview/Components/AssistantParts",
  decorators: [
    (Story) => (
      <AssistantStory turns={[proposalTurn]}>
        <div className="max-w-sm p-4">
          <Story />
        </div>
      </AssistantStory>
    ),
  ],
} satisfies Meta;
export default meta;

type Story = StoryObj;

const interrupt = {
  id: "a1b2c3",
  reason: APPROVAL,
  message: "Pause agent etl-runner until 2026-10-17 00:00 UTC",
  metadata: {
    name: "pause_agent",
    args: { agent_id: "etl-runner" },
    preview: "Pause agent etl-runner until 2026-10-17 00:00 UTC",
  },
};

const outcome = (o: Partial<ActionOutcome>): ActionOutcome => ({
  id: "a1b2c3",
  name: "pause_agent",
  preview: "Pause agent etl-runner until 2026-10-17 00:00 UTC",
  status: "completed",
  ...o,
});

/** Markdown answers; images become links, so nothing loads unasked. */
export const Markdown: Story = {
  render: () => (
    <MarkdownContent
      content={
        "**Two** agents were blocked.\n\n- support-bot\n- etl-runner\n\n![chart](https://example.com/chart.png)"
      }
    />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("img")).toBeNull();
    await expect(
      canvas.getByRole("link", { name: "chart" }),
    ).toBeInTheDocument();
  },
};

/** A page the assistant points to. */
export const PageLink: Story = {
  render: () => <NavigationChip value={{ path: "/events", label: "Events" }} />,
};

/** Waiting on an operator: Approve runs it as them, Cancel turns it down. */
export const Approval: Story = {
  render: function Card() {
    const resolve = fn();
    return (
      <ApprovalCard
        interrupt={interrupt}
        resolve={resolve}
        cancel={fn()}
        agent={undefined as never}
      />
    );
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Cancel" }));
  },
};

export const Completed: Story = {
  render: () => <ActionResult value={outcome({ result: { success: true } })} />,
};

export const Failed: Story = {
  render: () => (
    <ActionResult
      value={outcome({
        status: "failed",
        error: "Agent etl-runner is already paused",
      })}
    />
  ),
};

export const Rejected: Story = {
  render: () => <ActionResult value={outcome({ status: "rejected" })} />,
};
