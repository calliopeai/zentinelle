import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { useRiskStats } from "@/graphql/risks/hooks";

import type { Role } from "../../product";
import {
  NARROW,
  emptyRiskStats,
  riskMocks,
  riskStats,
  riskTrend,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  RisksOverviewScreen,
  type RisksOverviewScreenProps,
} from "./RisksOverviewScreen";

/** Risks > Overview, on `GetRiskStats` and REST `risks/trend`. */
const meta = {
  title: "Risk & compliance/Screens/Risks overview",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Overview({
  role = "operator",
  ...props
}: Partial<RisksOverviewScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/risks/overview" role={role} defaultAssistantHidden>
      <RisksOverviewScreen
        capabilities={capabilitiesOf(role)}
        stats={riskStats.riskStats}
        trend={riskTrend}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  render: () => <Overview />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Critical" }),
    ).toHaveAttribute("href", "/risks?riskLevel=critical");
    const tabs = within(canvas.getByRole("navigation", { name: "Risks" }));
    await expect(tabs.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

export const Viewer: Story = { render: () => <Overview role="viewer" /> };

export const Loading: Story = {
  render: () => (
    <Overview stats={null} trend={[]} loading trendState={{ loading: true }} />
  ),
};

export const Empty: Story = {
  render: () => <Overview stats={emptyRiskStats.riskStats} trend={[]} />,
};

export const LoadError: Story = {
  render: () => (
    <Overview
      stats={null}
      error={{ message: "riskStats failed." }}
      onRetry={() => {}}
    />
  ),
};

export const TrendFailed: Story = {
  render: () => (
    <Overview
      trend={[]}
      trendState={{ error: { message: "risks/trend answered 502." } }}
    />
  ),
};

export const LongData: Story = {
  render: () => (
    <Overview
      stats={{
        ...riskStats.riskStats!,
        totalRisks: 18452,
        openRisks: 12001,
        criticalRisks: 1204,
        highRisks: 3311,
        openIncidents: 98012,
        slaBreachedCount: 4410,
        slaMetCount: 93602,
      }}
    />
  ),
};

export const Narrow: Story = { ...NARROW, render: () => <Overview /> };

function Connected() {
  const { data, loading, error, refetch } = useRiskStats();
  return (
    <ShellStory path="/risks/overview" role="viewer" defaultAssistantHidden>
      <RisksOverviewScreen
        capabilities={capabilitiesOf("viewer")}
        stats={data?.riskStats ?? null}
        trend={riskTrend}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

/** The app's `useRiskStats` hook, answered by a mock of `GetRiskStats`. */
export const ConnectedToGetRiskStats: Story = {
  parameters: { graphql: { mocks: riskMocks.stats } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("of 7 in the register"),
    ).toBeInTheDocument();
  },
};
