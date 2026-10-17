import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { useUsageMetrics } from "@/graphql/usage/hooks";

import type { Role } from "../../product";
import { ShellStory } from "../../storybook/ShellStory";
import {
  FIXTURE_END,
  emptyUsageMetrics,
  longUsageMetrics,
  usageMetrics,
  usageMocks,
} from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { NARROW } from "./stories";
import { UsageOverviewScreen } from "./UsageOverviewScreen";
import { periodRange, toUsageOverview, type Period } from "./usage";

const meta = {
  title: "Screens/Models & usage/Usage overview",
  component: UsageOverviewScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("operator"),
    period: "30",
    onPeriodChange: fn(),
    overview: toUsageOverview(usageMetrics.usageMetrics),
    onRetry: fn(),
  },
  render: (args) => (
    <ShellStory path="/usage" role="operator" defaultAssistantHidden>
      <UsageOverviewScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof UsageOverviewScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Usage" }),
    ).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "Budgets" })).toHaveAttribute(
      "href",
      "/usage/budgets",
    );
    await expect(
      canvas.getByRole("link", { name: "support-bot" }),
    ).toHaveAttribute("href", "/agents/support-bot/usage");
  },
};

export const Loading: Story = { args: { overview: null, loading: true } };

export const Empty: Story = {
  args: { overview: toUsageOverview(emptyUsageMetrics.usageMetrics) },
};

export const Error: Story = {
  args: {
    overview: null,
    error: { message: "Something went wrong on the server." },
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /retry|try again/i }),
    );
    await expect(args.onRetry).toHaveBeenCalled();
  },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/usage" role="viewer" defaultAssistantHidden>
      <UsageOverviewScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    // Providers is admin-only: neither the sidebar nor the crumb offers it.
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link", { name: "Providers" })).toBeNull();
  },
};

export const LongStrings: Story = {
  args: { overview: toUsageOverview(longUsageMetrics.usageMetrics) },
};

export const Narrow: Story = { ...NARROW };

export const ChangesPeriod: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("radio", { name: "7d" }));
    await expect(args.onPeriodChange).toHaveBeenCalledWith("7");
  },
};

/** The route's wiring: the app's own hook, answered by the GetUsageMetrics mocks. */
function Connected({ role }: { role: Role }) {
  const [period, setPeriod] = React.useState<Period>("30");
  const range = React.useMemo(
    () => periodRange(period, new Date(FIXTURE_END)),
    [period],
  );
  const { metrics, loading, error, refetch } = useUsageMetrics(range);
  return (
    <ShellStory path="/usage" role={role} defaultAssistantHidden>
      <UsageOverviewScreen
        capabilities={capabilitiesOf(role)}
        period={period}
        onPeriodChange={setPeriod}
        overview={toUsageOverview(metrics)}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

export const ConnectedFull: Story = {
  parameters: { graphql: { mocks: usageMocks.full } },
  render: () => <Connected role="operator" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("$412.88")).toBeInTheDocument(),
    );
  },
};

export const ConnectedEmpty: Story = {
  parameters: { graphql: { mocks: usageMocks.empty } },
  render: () => <Connected role="operator" />,
};

export const ConnectedLoading: Story = {
  parameters: { graphql: { mocks: usageMocks.loading } },
  render: () => <Connected role="operator" />,
};

export const ConnectedError: Story = {
  parameters: { graphql: { mocks: usageMocks.error } },
  render: () => <Connected role="operator" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("Could not load usage")).toBeInTheDocument(),
    );
  },
};
