import type { Meta, StoryObj } from "@storybook/react-vite";

import { capabilitiesOf } from "../../../storybook/session";
import { EvidenceFrame } from "./EvidenceFrame";

const meta = {
  title: "Risk & compliance/Components/EvidenceFrame",
  component: EvidenceFrame,
  args: {
    capabilities: capabilitiesOf("admin"),
    tab: "atlas",
    disclaimer:
      "Threat-model vocabulary only; this mapping is not certification or endorsement.",
    onRefresh: () => {},
    children: <p className="text-sm">The body of the tab.</p>,
  },
} satisfies Meta<typeof EvidenceFrame>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Admin: Story = {};

export const Operator: Story = {
  args: { capabilities: capabilitiesOf("operator") },
};

export const Failed: Story = {
  args: { error: { message: "403 from evidence/controls" } },
};
