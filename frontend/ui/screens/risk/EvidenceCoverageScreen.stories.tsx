import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import type { Role } from "../../product";
import {
  NARROW,
  controlEvidence,
  emptyControlEvidence,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  EvidenceCoverageScreen,
  type EvidenceCoverageScreenProps,
} from "./EvidenceCoverageScreen";

/** Evidence > Coverage (admin), on REST `evidence/controls`. */
const meta = {
  title: "Risk & compliance/Screens/Evidence coverage",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Coverage({
  role = "admin",
  ...props
}: Partial<EvidenceCoverageScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/evidence" role={role} defaultAssistantHidden>
      <EvidenceCoverageScreen
        capabilities={capabilitiesOf(role)}
        evidence={controlEvidence}
        onRefresh={() => {}}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  render: () => <Coverage />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: /^nightly-sync/ }),
    ).toHaveAttribute("href", "/agents/nightly-sync/activity");
    await expect(
      canvas.getAllByText("Verified operating").length,
    ).toBeGreaterThan(0);
  },
};

/** Evidence is admin-only: an operator who follows an old link gets the 403, not a failed request. */
export const Operator: Story = {
  render: () => <Coverage role="operator" />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Evidence needs the admin role"),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  render: () => <Coverage evidence={null} loading />,
};

export const Empty: Story = {
  render: () => <Coverage evidence={emptyControlEvidence} />,
};

export const LoadError: Story = {
  render: () => (
    <Coverage
      evidence={null}
      error={{ message: "evidence/controls answered 500." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = {
  render: () => (
    <Coverage
      evidence={{
        ...controlEvidence,
        runtime_coverage: {
          ...controlEvidence.runtime_coverage,
          registered_workloads: 60,
          workloads: Array.from({ length: 60 }, (_, i) => ({
            ...controlEvidence.runtime_coverage.workloads[i % 4],
            endpoint_id: `a-${i}`,
            agent_id: `${controlEvidence.runtime_coverage.workloads[i % 4].agent_id}-eu-west-1-shard-${i}-with-a-long-deployment-suffix`,
          })),
        },
      }}
    />
  ),
};

export const Narrow: Story = { ...NARROW, render: () => <Coverage /> };
