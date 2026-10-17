import type { Meta, StoryObj } from "@storybook/react-vite";

import { RiskLevelBadge } from "./RiskLevelBadge";

const meta = {
  title: "Risk & compliance/Components/RiskLevelBadge",
  component: RiskLevelBadge,
  args: { level: "critical", score: 320 },
} satisfies Meta<typeof RiskLevelBadge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Critical: Story = {};

export const EveryLevel: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      <RiskLevelBadge level="critical" score={320} />
      <RiskLevelBadge level="high" score={120} />
      <RiskLevelBadge level="medium" score={45} />
      <RiskLevelBadge level="low" score={4} />
      <RiskLevelBadge level={null} />
    </div>
  ),
};
