import type { Meta, StoryObj } from "@storybook/react-vite";

import { PolicyStatus } from "./PolicyStatus";

const meta = {
  title: "Policies/Components/PolicyStatus",
  component: PolicyStatus,
  args: { enabled: true, enforcement: "enforce" },
} satisfies Meta<typeof PolicyStatus>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Enforce: Story = {};
export const AuditOnly: Story = { args: { enforcement: "audit" } };
export const Disabled: Story = { args: { enforcement: "disabled" } };
export const Off: Story = { args: { enabled: false } };
export const UnknownMode: Story = { args: { enforcement: "shadow" } };
