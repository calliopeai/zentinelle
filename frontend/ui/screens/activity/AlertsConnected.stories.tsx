import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";

import {
  alertsMocks,
  notificationsMocks,
} from "../../storybook/fixtures/activity";
import { ShellStory } from "../../storybook/ShellStory";
import { AlertsConnected } from "./AlertsConnected";

const meta = {
  title: "Activity/Alerts (connected)",
  component: AlertsConnected,
  parameters: {
    layout: "fullscreen",
    graphql: { mocks: [...alertsMocks.full, ...notificationsMocks.full] },
  },
  args: { view: "open", canMutate: true },
  render: (args) => (
    <ShellStory
      path={args.view === "open" ? "/alerts" : `/alerts?view=${args.view}`}
      role={args.canMutate ? "operator" : "viewer"}
      defaultAssistantHidden
    >
      <AlertsConnected {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AlertsConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

/** `ComplianceAlerts` with `status: "open"`, and the alert mutations behind each row's menu. */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("PII in model output");
  },
};

/** `Notifications`: the Mine view that replaces /notifications. */
export const Mine: Story = {
  args: { view: "mine" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(
      "nightly-sync is at 82% of its monthly budget",
    );
  },
};

export const Viewer: Story = { args: { canMutate: false } };

export const Error: Story = {
  parameters: {
    graphql: { mocks: [...alertsMocks.error, ...notificationsMocks.full] },
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
