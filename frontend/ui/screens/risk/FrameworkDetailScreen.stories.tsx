import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { useComplianceOverview } from "@/graphql/compliance/hooks";

import type { Role } from "../../product";
import {
  NARROW,
  complianceMocks,
  complianceOverview,
  complianceOverviewAllEnabled,
  complianceOverviewNothingEnabled,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  FrameworkDetailScreen,
  type FrameworkDetailScreenProps,
} from "./FrameworkDetailScreen";

/** A framework (`/compliance/{id}`) on live `frameworkCoverage`, in place of the hard-coded control table. */
const meta = {
  title: "Risk & compliance/Screens/Framework detail",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<FrameworkDetailScreenProps>;

function Framework({
  role = "operator",
  frameworkId = "HIPAA",
  ...props
}: Partial<FrameworkDetailScreenProps> & { role?: Role }) {
  return (
    <ShellStory
      path={`/compliance/${frameworkId}`}
      role={role}
      defaultAssistantHidden
    >
      <FrameworkDetailScreen
        capabilities={capabilitiesOf(role)}
        frameworkId={frameworkId}
        overview={complianceOverview.complianceOverview}
        {...props}
      />
    </ShellStory>
  );
}

export const SomeMissing: Story = {
  args: { onGenerateReport: fn() },
  render: (args) => <Framework onGenerateReport={args.onGenerateReport} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "HIPAA" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("PHI Detection")).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate report" }),
    );
    await expect(args.onGenerateReport).toHaveBeenCalled();
  },
};

/** One of the frameworks the old page sent to "Framework not found". */
export const Iso42001: Story = {
  render: () => <Framework frameworkId="ISO42001" />,
};

export const FullyConfigured: Story = {
  render: () => (
    <Framework overview={complianceOverviewAllEnabled.complianceOverview} />
  ),
};

export const NothingConfigured: Story = {
  render: () => (
    <Framework overview={complianceOverviewNothingEnabled.complianceOverview} />
  ),
};

export const Viewer: Story = { render: () => <Framework role="viewer" /> };

export const Loading: Story = {
  render: () => <Framework overview={null} loading />,
};

export const NotTracked: Story = {
  render: () => <Framework frameworkId="FEDRAMP" />,
};

export const LoadError: Story = {
  render: () => (
    <Framework
      overview={null}
      error={{ message: "complianceOverview failed." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = {
  render: () => {
    const base = complianceOverview.complianceOverview!;
    return (
      <Framework
        frameworkId="EU_AI_ACT"
        overview={{
          ...base,
          frameworkCoverage: base.frameworkCoverage.map((f) =>
            f.id === "EU_AI_ACT"
              ? {
                  ...f,
                  name: "Regulation (EU) 2024/1689 laying down harmonised rules on artificial intelligence",
                  description:
                    "European Union Artificial Intelligence Act, high-risk system obligations under Title III",
                }
              : f,
          ),
        }}
      />
    );
  },
};

export const Narrow: Story = { ...NARROW, render: () => <Framework /> };

function Connected() {
  const { overview, loading, error } = useComplianceOverview();
  return (
    <ShellStory path="/compliance/SOC2" role="viewer" defaultAssistantHidden>
      <FrameworkDetailScreen
        capabilities={capabilitiesOf("viewer")}
        frameworkId="SOC2"
        overview={overview}
        loading={loading}
        error={error}
      />
    </ShellStory>
  );
}

export const ConnectedToGetComplianceOverview: Story = {
  parameters: { graphql: { mocks: complianceMocks.overview } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", {
        name: "SOC 2 Type II",
      }),
    ).toBeInTheDocument();
  },
};
