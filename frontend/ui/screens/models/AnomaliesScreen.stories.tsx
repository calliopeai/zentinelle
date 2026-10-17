import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { useUsageMetrics } from "@/graphql/usage/hooks";

import { ShellStory } from "../../storybook/ShellStory";
import {
  FIXTURE_END,
  emptyUsageMetrics,
  longUsageMetrics,
  usageMetrics,
  usageMocks,
} from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { detectAnomalies, tokenBaseline } from "./anomalies";
import { AnomaliesScreen, type AnomalyFilter } from "./AnomaliesScreen";
import { NARROW } from "./stories";
import { periodRange } from "./usage";

const full = usageMetrics.usageMetrics;

const meta = {
  title: "Screens/Models & usage/Anomalies",
  component: AnomaliesScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("operator"),
    anomalies: detectAnomalies(full, FIXTURE_END),
    baseline: tokenBaseline(full),
    filter: "all",
    onFilterChange: fn(),
    onRetry: fn(),
  },
  render: (args) => (
    <ShellStory path="/usage/anomalies" role="operator" defaultAssistantHidden>
      <AnomaliesScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AnomaliesScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("Daily tokens").length).toBeGreaterThan(0);
    await expect(
      canvas.getByRole("link", { name: "support-bot" }),
    ).toHaveAttribute("href", "/agents/support-bot/usage");
    await expect(canvas.getAllByText("Endpoint latency")).toHaveLength(2);
  },
};

export const Loading: Story = {
  args: { anomalies: [], baseline: [], loading: true },
};

export const Empty: Story = {
  args: {
    anomalies: detectAnomalies(emptyUsageMetrics.usageMetrics, FIXTURE_END),
    baseline: tokenBaseline(emptyUsageMetrics.usageMetrics),
  },
};

export const EmptyFiltered: Story = { args: { filter: "cost" } };

export const Error: Story = {
  args: {
    anomalies: [],
    baseline: [],
    error: { message: "Something went wrong on the server." },
  },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/usage/anomalies" role="viewer" defaultAssistantHidden>
      <AnomaliesScreen {...args} />
    </ShellStory>
  ),
};

export const LongStrings: Story = {
  args: {
    anomalies: detectAnomalies(longUsageMetrics.usageMetrics, FIXTURE_END),
    baseline: tokenBaseline(longUsageMetrics.usageMetrics),
  },
};

export const Narrow: Story = { ...NARROW };

export const FiltersByKind: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Kind" }),
      "latency",
    );
    await expect(args.onFilterChange).toHaveBeenCalledWith("latency");
  },
};

function Connected() {
  const [filter, setFilter] = React.useState<AnomalyFilter>("all");
  const range = React.useMemo(
    () => periodRange("30", new Date(FIXTURE_END)),
    [],
  );
  const { metrics, loading, error, refetch } = useUsageMetrics(range);
  return (
    <ShellStory path="/usage/anomalies" role="operator" defaultAssistantHidden>
      <AnomaliesScreen
        capabilities={capabilitiesOf("operator")}
        anomalies={detectAnomalies(metrics, range.endDate)}
        baseline={tokenBaseline(metrics)}
        filter={filter}
        onFilterChange={setFilter}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

export const ConnectedFull: Story = {
  parameters: { graphql: { mocks: usageMocks.full } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(
        canvas.getByRole("link", { name: "support-bot" }),
      ).toBeInTheDocument(),
    );
  },
};
