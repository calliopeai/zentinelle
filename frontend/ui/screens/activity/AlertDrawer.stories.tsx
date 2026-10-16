import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent } from "storybook/test";

import { alerts, longAlerts } from "../../storybook/fixtures/activity";
import { AlertDrawer } from "./AlertDrawer";

const meta = {
  title: "Activity/AlertDrawer",
  component: AlertDrawer,
  args: {
    alert: alerts[0],
    onClose: fn(),
    canMutate: true,
    onAcknowledge: fn(),
    onResolve: fn(),
    onDismiss: fn(),
  },
} satisfies Meta<typeof AlertDrawer>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Acknowledge" }),
    );
    await expect(args.onAcknowledge).toHaveBeenCalledWith(alerts[0]);
  },
};

/** Acknowledged already: Resolve and Dismiss are left. */
export const Acknowledged: Story = {
  args: { alert: alerts[1] },
  play: async () => {
    await screen.findByRole("button", { name: "Resolve" });
    await expect(
      screen.queryByRole("button", { name: "Acknowledge" }),
    ).toBeNull();
  },
};

/** Resolved: notes and who resolved it, no actions. */
export const Resolved: Story = {
  args: { alert: alerts[3] },
  play: async () => {
    await screen.findByText("Threshold retuned after the model upgrade.");
    await expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  },
};

/** A viewer reads the alert and cannot act on it. */
export const Viewer: Story = {
  args: { canMutate: false },
  play: async () => {
    await screen.findByText("PII in model output");
    await expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  },
};

export const LongData: Story = { args: { alert: longAlerts[0] } };

export const Closed: Story = { args: { alert: null } };
