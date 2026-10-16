import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  NOW,
  heldRequests,
  longRequest,
} from "../../storybook/fixtures/agents";
import { ApprovalCard } from "./ApprovalCard";

const [TOOL_CALL, DELEGATION, EXPIRED] = heldRequests();

/** One held action, as GET /approvals/requests returns it. */
const meta = {
  title: "Screens/Agents/Approval card",
  component: ApprovalCard,
  args: {
    request: TOOL_CALL,
    now: NOW,
    canDecide: true,
    locked: false,
    saving: false,
    reason: "",
    onReasonChange: fn(),
    onDecide: fn(),
  },
} satisfies Meta<typeof ApprovalCard>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Operator: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Deny" }),
    );
    await expect(args.onDecide).toHaveBeenCalledWith("deny");
  },
};

/** A viewer sees the request and no decision controls. */
export const Viewer: Story = {
  args: { canDecide: false },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Approve" }),
    ).toBeNull();
  },
};

/** No tool arguments retained: the card says why and where capture is set. */
export const NoArguments: Story = { args: { request: DELEGATION } };

export const Expired: Story = {
  args: { request: EXPIRED },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "Approve" }),
    ).toBeDisabled();
  },
};

export const Saving: Story = {
  args: { locked: true, saving: true, reason: "Customer confirmed by phone." },
};

export const LongData: Story = { args: { request: longRequest } };

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-96">
        <Story />
      </div>
    ),
  ],
};
