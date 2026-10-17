import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen } from "storybook/test";

import { VerifyChainDialog } from "./VerifyChainDialog";

const meta = {
  title: "Activity/VerifyChainDialog",
  component: VerifyChainDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    verifying: false,
    result: {
      valid: true,
      records_checked: 48211,
      broken_at_sequence: null,
      root_hash:
        "9f2c4e1ab37d0c5e8f6a2b1d4c7e9a0b3f5d8c2e1a4b7d0c3e6f9a2b5d8c1e4f",
      unverifiable_records: 0,
    },
  },
} satisfies Meta<typeof VerifyChainDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Intact: Story = {
  play: async () => {
    await expect(await screen.findByText("intact")).toBeInTheDocument();
  },
};

export const Broken: Story = {
  args: {
    result: {
      valid: false,
      records_checked: 1290,
      broken_at_sequence: 1288,
      root_hash: "9f2c4e1ab37d0c5e",
      expected_hash:
        "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90",
      actual_hash:
        "00b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f91",
      unverifiable_records: 12,
    },
  },
  play: async () => {
    await screen.findByText("broken");
    await screen.findByText("1288");
  },
};

export const Verifying: Story = { args: { verifying: true, result: null } };

export const Error: Story = {
  args: {
    result: null,
    error: { message: "tenant_id is required" },
    onRetry: fn(),
  },
};
