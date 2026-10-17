import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, within } from "storybook/test";

import { auditLogs, longAuditLogs } from "../../storybook/fixtures/activity";
import { AuditEntryDrawer } from "./AuditEntryDrawer";

const meta = {
  title: "Activity/AuditEntryDrawer",
  component: AuditEntryDrawer,
  args: { entry: auditLogs[0], onClose: fn() },
} satisfies Meta<typeof AuditEntryDrawer>;
export default meta;

type Story = StoryObj<typeof meta>;

/** A change: the fields before and after. */
export const Change: Story = {
  play: async () => {
    const table = await screen.findByRole("table");
    await expect(within(table).getByText("enforce")).toBeInTheDocument();
  },
};

/** Done by an API key, and refused. */
export const ByApiKey: Story = {
  args: { entry: auditLogs[2] },
  play: async () => {
    await screen.findAllByText("API key znt_live_7f3c");
  },
};

export const LongData: Story = { args: { entry: longAuditLogs[0] } };

export const Closed: Story = { args: { entry: null } };
