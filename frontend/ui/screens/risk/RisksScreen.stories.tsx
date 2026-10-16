import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { useRisks } from "@/graphql/risks/hooks";
import type { RiskData, RiskListVariables } from "@/graphql/risks/types";

import type { Role } from "../../product";
import {
  NARROW,
  longRisk,
  manyRisks,
  riskMocks,
  risks,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  RisksScreen,
  type RegisterView,
  type RisksScreenProps,
} from "./RisksScreen";

/**
 * Risks > Register. The route maps `GetRisks` (graphql/risks/queries.ts)
 * onto these props; the Connected story runs the app's own `useRisks` hook
 * against mocks of that document.
 */
const meta = {
  title: "Risk & compliance/Screens/Risks",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const byRpn = (rows: readonly RiskData[]) =>
  [...rows].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0));

function Register({
  role = "operator",
  view = "list",
  rows = risks,
  initialFilters = {},
  ...props
}: Partial<RisksScreenProps> & {
  role?: Role;
  rows?: readonly RiskData[];
  initialFilters?: RiskListVariables;
}) {
  const [filters, setFilters] =
    React.useState<RiskListVariables>(initialFilters);
  const path = view === "list" ? "/risks" : `/risks?view=${view}`;
  return (
    <ShellStory path={path} role={role} defaultAssistantHidden>
      <RisksScreen
        capabilities={capabilitiesOf(role)}
        view={view as RegisterView}
        risks={view === "rpn" ? byRpn(rows) : rows}
        filters={filters}
        onFiltersChange={setFilters}
        {...props}
      />
    </ShellStory>
  );
}

export const List: Story = {
  render: () => <Register />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Risks" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", {
        name: /^Prompt injection through retrieved documents/,
      }),
    ).toHaveAttribute("href", "/risks/r-01");
    await expect(
      canvas.getByRole("link", { name: "New risk" }),
    ).toBeInTheDocument();
  },
};

export const Matrix: Story = {
  render: () => <Register view="matrix" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", {
        name: "1 risk, likelihood Possible, impact Severe",
      }),
    );
    await expect(
      canvas.getByRole("heading", {
        name: "Possible likelihood, Severe impact",
      }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /^PHI in model prompts/ }),
    ).toBeInTheDocument();
  },
};

export const ByRpn: Story = { render: () => <Register view="rpn" /> };

export const Viewer: Story = {
  render: () => <Register role="viewer" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link", { name: "New risk" })).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: /Row actions/i }),
    ).toBeNull();
  },
};

export const Loading: Story = { render: () => <Register rows={[]} loading /> };

export const Empty: Story = { render: () => <Register rows={[]} /> };

export const EmptyAfterFiltering: Story = {
  render: () => (
    <Register
      rows={[]}
      initialFilters={{ search: "quantum", riskLevel: "critical" }}
    />
  ),
};

export const LoadError: Story = {
  render: () => (
    <Register
      rows={[]}
      error={{ message: "Could not reach the risk register." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = {
  render: () => <Register rows={[longRisk, ...manyRisks]} />,
};

export const Narrow: Story = {
  ...NARROW,
  render: () => <Register view="matrix" />,
};

function Connected() {
  const [filters, setFilters] = React.useState<RiskListVariables>({});
  const { risks: rows, loading, error, refetch } = useRisks(filters);
  return (
    <ShellStory path="/risks" role="operator" defaultAssistantHidden>
      <RisksScreen
        capabilities={capabilitiesOf("operator")}
        view="list"
        risks={rows}
        filters={filters}
        onFiltersChange={setFilters}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

/** The app's `useRisks` hook, answered by a mock of `GetRisks`. */
export const ConnectedToGetRisks: Story = {
  parameters: { graphql: { mocks: riskMocks.list } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", {
        name: /^PHI in model prompts/,
      }),
    ).toBeInTheDocument();
  },
};

export const ConnectedError: Story = {
  parameters: { graphql: { mocks: riskMocks.listError } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "Could not reach the risk register.",
      ),
    ).toBeInTheDocument();
  },
};
