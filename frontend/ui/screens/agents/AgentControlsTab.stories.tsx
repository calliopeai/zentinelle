import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import { control, emptyControl } from "../../storybook/fixtures/agents";
import {
  AgentControlsTab,
  type AgentControlsTabProps,
} from "./AgentControlsTab";

/** Controls (admin): GET /agents/{agent_id}/control, and its stop actions. */
const meta = {
  title: "Screens/Agents/Tabs/Controls",
  component: AgentControlsTab,
  args: {
    agentName: "support-bot",
    state: "ready",
    data: control,
    onRetry: fn(),
    onAction: fn(async () => {}),
  },
} satisfies Meta<typeof AgentControlsTab>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Loading: Story = { args: { state: "loading", data: null } };
export const Empty: Story = { args: { data: emptyControl } };
export const LoadFailed: Story = {
  args: {
    state: "error",
    data: null,
    error: { message: "Controls could not be loaded." },
  },
};

/** The endpoint answers 403 to anyone but an administrator. */
export const Denied: Story = { args: { state: "denied", data: null } };

export const Suspend: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Suspend" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Suspend" }),
    );
    await waitFor(() => expect(args.onAction).toHaveBeenCalledWith("suspend"));
  },
};

/** An organization that requires approval for control actions refuses one taken directly. */
export const ActionRefused: Story = {
  args: {
    onAction: fn<AgentControlsTabProps["onAction"]>(async () => {
      throw new Error(
        "Current human approval for this exact control action is required",
      );
    }),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Emergency stop" }),
    );
    const dialog = await screen.findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Emergency stop" }),
    );
    await expect(
      await within(dialog).findByText(/human approval/),
    ).toBeInTheDocument();
  },
};

export const LongData: Story = {
  args: {
    data: {
      ...control,
      agent: {
        ...control.agent,
        tools: Array.from(
          { length: 24 },
          (_, i) => `tool_number_${i}_with_a_descriptive_name`,
        ),
        data_access: [
          "s3://enterprise-customer-exports-eu-west-1/regulated/2026/10/16/",
        ],
      },
      incidents: [
        {
          id: "inc-long",
          status: "investigating",
          severity: "critical",
          title:
            "Refund issued above the approval threshold to an account flagged by the fraud model in the EMEA enterprise queue",
        },
      ],
    },
  },
};

export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-192">
        <Story />
      </div>
    ),
  ],
};
