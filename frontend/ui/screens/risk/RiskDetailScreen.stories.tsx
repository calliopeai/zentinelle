import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { useRisk } from "@/graphql/risks/hooks";

import type { Role } from "../../product";
import {
  NARROW,
  longRisk,
  riskMocks,
  risks,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  RiskDetailScreen,
  type RiskDetailScreenProps,
} from "./RiskDetailScreen";

/** A risk (`/risks/{id}`), on `GetRisk`; Mark reviewed is `ReviewRisk`, Delete is `DeleteRisk`. */
const meta = {
  title: "Risk & compliance/Screens/Risk detail",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<RiskDetailScreenProps & { role: Role }>;

function Detail({
  role = "operator",
  ...props
}: Partial<RiskDetailScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/risks/r-01" role={role} defaultAssistantHidden>
      <RiskDetailScreen
        capabilities={capabilitiesOf(role)}
        risk={risks[0]}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  args: { onDelete: fn() },
  render: (args) => <Detail onDelete={args.onDelete} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("button", { name: "Mark reviewed" }),
    ).toBeInTheDocument();
    await userEvent.click(canvas.getByRole("button", { name: "More actions" }));
    await userEvent.click(
      await within(document.body).findByRole("menuitem", { name: "Delete" }),
    );
    const dialog = await within(document.body).findByRole("alertdialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Delete risk" }),
    );
    await expect(args.onDelete).toHaveBeenCalled();
  },
};

export const NotReviewed: Story = { render: () => <Detail risk={risks[4]} /> };

export const Reviewing: Story = { render: () => <Detail reviewing /> };

export const Viewer: Story = {
  render: () => <Detail role="viewer" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("button", { name: "Mark reviewed" }),
    ).toBeNull();
    await expect(
      canvas.queryByRole("button", { name: "More actions" }),
    ).toBeNull();
  },
};

export const Loading: Story = { render: () => <Detail risk={null} loading /> };

export const NotFound: Story = { render: () => <Detail risk={null} /> };

export const LoadError: Story = {
  render: () => (
    <Detail
      risk={null}
      error={{ message: "GetRisk failed." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = { render: () => <Detail risk={longRisk} /> };

export const Narrow: Story = { ...NARROW, render: () => <Detail /> };

function Connected() {
  const { risk, loading, error, refetch } = useRisk("r-01");
  return (
    <ShellStory path="/risks/r-01" role="operator" defaultAssistantHidden>
      <RiskDetailScreen
        capabilities={capabilitiesOf("operator")}
        risk={risk}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

/** The app's `useRisk` hook, answered by a mock of `GetRisk`. */
export const ConnectedToGetRisk: Story = {
  parameters: { graphql: { mocks: riskMocks.detail } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("heading", {
        name: "Prompt injection through retrieved documents",
      }),
    ).toBeInTheDocument();
  },
};

export const ConnectedMissing: Story = {
  parameters: { graphql: { mocks: riskMocks.detailMissing } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(
        "This risk is not in the register",
      ),
    ).toBeInTheDocument();
  },
};
