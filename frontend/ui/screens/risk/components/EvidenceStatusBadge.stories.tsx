import type { Meta, StoryObj } from "@storybook/react-vite";

import { EvidenceStatusBadge } from "./EvidenceStatusBadge";

const meta = {
  title: "Risk & compliance/Components/EvidenceStatusBadge",
  component: EvidenceStatusBadge,
  args: { status: "verified-operating" },
} satisfies Meta<typeof EvidenceStatusBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const VerifiedOperating: Story = {};

export const EveryStatus: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {[
        "verified-operating",
        "observation-only",
        "stale",
        "failed",
        "unknown",
        "unverified",
        "unsupported",
        null,
      ].map((status) => (
        <EvidenceStatusBadge key={String(status)} status={status} />
      ))}
    </div>
  ),
};
