import type { Meta, StoryObj } from "@storybook/react-vite";
import { screen, userEvent, within } from "storybook/test";

import { auditLogsMocks } from "../../storybook/fixtures/activity";
import { ShellStory } from "../../storybook/ShellStory";
import { AuditLogConnected } from "./AuditLogConnected";

const meta = {
  title: "Activity/Audit log (connected)",
  component: AuditLogConnected,
  parameters: {
    layout: "fullscreen",
    graphql: { mocks: auditLogsMocks.full },
  },
  args: {
    today: "2026-10-16",
    verify: async () => ({
      valid: true,
      records_checked: 48211,
      broken_at_sequence: null,
      root_hash: "9f2c4e1ab37d0c5e8f6a2b1d4c7e9a0b",
    }),
  },
  render: (args) => (
    <ShellStory path="/audit-logs" role="admin" defaultAssistantHidden>
      <AuditLogConnected {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AuditLogConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

/** `GetAuditLogs`, the exports, and REST `audit/verify` behind Verify chain. */
export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("api_key.create");
    await userEvent.click(canvas.getByRole("button", { name: "Verify chain" }));
    await screen.findByText("intact");
  },
};

export const VerifyFails: Story = {
  args: {
    verify: async () => {
      throw new globalThis.Error("");
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: "Verify chain",
      }),
    );
    await screen.findByText("The chain could not be verified.");
  },
};

export const Error: Story = {
  parameters: { graphql: { mocks: auditLogsMocks.error } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
