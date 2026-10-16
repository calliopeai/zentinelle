import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import type { Role } from "../../product";
import {
  NARROW,
  complianceOverview,
  complianceOverviewAllEnabled,
  complianceOverviewNothingEnabled,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  ComplianceGapsScreen,
  type ComplianceGapsScreenProps,
} from "./ComplianceGapsScreen";

/** Compliance > Gaps, folded from the same `GetComplianceOverview` answer. */
const meta = {
  title: "Risk & compliance/Screens/Compliance gaps",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Gaps({
  role = "operator",
  ...props
}: Partial<ComplianceGapsScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/compliance/gaps" role={role} defaultAssistantHidden>
      <ComplianceGapsScreen
        capabilities={capabilitiesOf(role)}
        overview={complianceOverview.complianceOverview}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  render: () => <Gaps />,
  play: async ({ canvasElement }) => {
    const rows = within(canvasElement).getAllByRole("row");
    // Header, then the widest required gap first: Agent Capability Control
    // and Jailbreak detection are each required by two frameworks.
    await expect(rows[1]).toHaveTextContent(/Required/);
  },
};

export const Viewer: Story = { render: () => <Gaps role="viewer" /> };

export const Loading: Story = {
  render: () => <Gaps overview={null} loading />,
};

export const NoGaps: Story = {
  render: () => (
    <Gaps overview={complianceOverviewAllEnabled.complianceOverview} />
  ),
};

export const EverythingMissing: Story = {
  render: () => (
    <Gaps overview={complianceOverviewNothingEnabled.complianceOverview} />
  ),
};

export const LoadError: Story = {
  render: () => (
    <Gaps
      overview={null}
      error={{ message: "complianceOverview failed." }}
      onRetry={() => {}}
    />
  ),
};

export const Narrow: Story = { ...NARROW, render: () => <Gaps /> };
