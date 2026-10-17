import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { useComplianceOverview } from "@/graphql/compliance/hooks";

import type { Role } from "../../product";
import {
  NARROW,
  complianceMocks,
  complianceOverview,
  complianceOverviewAllEnabled,
  complianceOverviewNothingEnabled,
  compliancePacks,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { CompliancePacksDialog } from "./components/CompliancePacksDialog";
import {
  ComplianceScreen,
  type ComplianceScreenProps,
} from "./ComplianceScreen";

/** Compliance > Frameworks, on `GetComplianceOverview`. Run check is `RunComplianceCheck`. */
const meta = {
  title: "Risk & compliance/Screens/Compliance",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<ComplianceScreenProps>;

function Compliance({
  role = "operator",
  ...props
}: Partial<ComplianceScreenProps> & { role?: Role }) {
  return (
    <ShellStory path="/compliance" role={role} defaultAssistantHidden>
      <ComplianceScreen
        capabilities={capabilitiesOf(role)}
        overview={complianceOverview.complianceOverview}
        {...props}
      />
    </ShellStory>
  );
}

export const Full: Story = {
  args: { onRunCheck: fn() },
  render: (args) => <Compliance onRunCheck={args.onRunCheck} />,
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "SOC 2 Type II" }),
    ).toHaveAttribute("href", "/compliance/SOC2");
    await expect(canvas.getByRole("link", { name: "PCI DSS" })).toHaveAttribute(
      "href",
      "/compliance/PCI-DSS",
    );
    await expect(canvas.queryByText(/\bmet\b/i)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Run check" }));
    await expect(args.onRunCheck).toHaveBeenCalled();
  },
};

export const Admin: Story = { render: () => <Compliance role="admin" /> };

export const Viewer: Story = {
  render: () => <Compliance role="viewer" />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Run check" }),
    ).toBeNull();
  },
};

export const Checking: Story = { render: () => <Compliance checking /> };

export const Loading: Story = {
  render: () => <Compliance overview={null} loading />,
};

export const NothingConfigured: Story = {
  render: () => (
    <Compliance
      overview={complianceOverviewNothingEnabled.complianceOverview}
    />
  ),
};

export const EverythingConfigured: Story = {
  render: () => (
    <Compliance overview={complianceOverviewAllEnabled.complianceOverview} />
  ),
};

export const LoadError: Story = {
  render: () => (
    <Compliance
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
      <Compliance
        overview={{
          ...base,
          frameworkCoverage: base.frameworkCoverage.map((f) => ({
            ...f,
            name: `${f.name}: ${f.description} as amended and extended for agentic systems`,
          })),
        }}
      />
    );
  },
};

export const Narrow: Story = { ...NARROW, render: () => <Compliance /> };

function WithPacks() {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Compliance onOpenPacks={() => setOpen(true)} />
      <CompliancePacksDialog
        open={open}
        onOpenChange={setOpen}
        packs={compliancePacks}
        onActivate={async () => undefined}
      />
    </>
  );
}

/** The menu opens the packs dialog (`ListCompliancePacks`, `ActivateCompliancePack`). */
export const ApplyAPack: Story = {
  render: () => <WithPacks />,
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "More actions" }),
    );
    await userEvent.click(
      await within(document.body).findByRole("menuitem", {
        name: "Apply a compliance pack",
      }),
    );
    await expect(
      await within(document.body).findByRole("dialog"),
    ).toHaveTextContent("HIPAA baseline");
  },
};

function Connected() {
  const { data, loading, error, refetch } = useComplianceOverview();
  return (
    <ShellStory path="/compliance" role="viewer" defaultAssistantHidden>
      <ComplianceScreen
        capabilities={capabilitiesOf("viewer")}
        overview={data?.complianceOverview ?? null}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

/** The app's `useComplianceOverview` hook, answered by a mock of `GetComplianceOverview`. */
export const ConnectedToGetComplianceOverview: Story = {
  parameters: { graphql: { mocks: complianceMocks.overview } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", { name: "ISO 42001" }),
    ).toBeInTheDocument();
  },
};
