import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  useLegalHoldOptions,
  useLegalHolds,
} from "@/graphql/legal-holds/hooks";

import {
  NARROW,
  legalHoldMocks,
  legalHoldOptions,
  legalHolds,
  longLegalHolds,
  longRetentionPolicies,
  retentionPolicies,
} from "../../storybook/fixtures/settings";
import { ShellStory } from "../../storybook/ShellStory";
import {
  RetentionScreen,
  type HoldFilters,
  type RetentionScreenProps,
} from "./RetentionScreen";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

const callbacks = {
  policyActions: {
    onSave: fn(async () => {}),
    onToggle: fn(async () => {}),
    onDelete: fn(async () => {}),
  },
  holdActions: {
    onCreate: fn(async () => {}),
    onRelease: fn(async () => {}),
    onDelete: fn(async () => {}),
  },
  onFiltersChange: fn(),
};

const options = legalHoldOptions.legalHoldOptions!;

const ready: RetentionScreenProps = {
  tab: "policies",
  policies: { data: retentionPolicies },
  activeHolds: 2,
  holds: { data: legalHolds.legalHolds },
  holdTypes: options.holdTypes,
  holdStatuses: options.statuses,
  filters: { holdType: "", status: "" },
  ...callbacks,
};

const meta = {
  title: "Settings/Screens/Data retention",
  component: RetentionScreen,
  parameters: { layout: "fullscreen" },
  args: ready,
  render: (args) => (
    <ShellStory
      path={
        args.tab === "policies"
          ? "/settings/retention"
          : "/settings/retention/legal-holds"
      }
      defaultAssistantHidden
    >
      <RetentionScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof RetentionScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Policies: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Data retention" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("2 active legal holds keep data past these policies.", {
        exact: false,
      }),
    ).toBeInTheDocument();
  },
};

export const PoliciesEmpty: Story = {
  args: { policies: { data: [] }, activeHolds: 0 },
};

export const PoliciesLoading: Story = {
  args: { policies: { data: null, loading: true } },
};

export const PoliciesFailed: Story = {
  args: {
    policies: { data: null, error: { message: "Network error" }, retry: fn() },
  },
};

export const PoliciesLongData: Story = {
  args: { policies: { data: longRetentionPolicies } },
};

export const TogglesAPolicy: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("switch", {
        name: "Enable Interactions, anonymize after a year",
      }),
    );
    await expect(args.policyActions.onToggle).toHaveBeenCalledWith(
      retentionPolicies[2],
      true,
    );
  },
};

export const LegalHolds: Story = { args: { tab: "legal-holds" } };

export const LegalHoldsEmpty: Story = {
  args: { tab: "legal-holds", holds: { data: [] } },
};

export const LegalHoldsFiltered: Story = {
  args: {
    tab: "legal-holds",
    holds: { data: [] },
    filters: { holdType: "preservation", status: "" },
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("No hold matches these filters"),
    ).toBeInTheDocument();
  },
};

export const LegalHoldsLoading: Story = {
  args: { tab: "legal-holds", holds: { data: null, loading: true } },
};

export const LegalHoldsFailed: Story = {
  args: {
    tab: "legal-holds",
    holds: { data: null, error: { message: "Network error" }, retry: fn() },
  },
};

export const LegalHoldsLongData: Story = {
  args: { tab: "legal-holds", holds: { data: longLegalHolds.legalHolds } },
};

export const Narrow: Story = { ...NARROW };

export const NarrowLegalHolds: Story = {
  ...NARROW,
  args: { tab: "legal-holds" },
};

export const Viewer: Story = {
  render: () => (
    <ShellStory path="/settings/retention" role="viewer" defaultAssistantHidden>
      <SettingsForbiddenScreen title="Data retention" />
    </ShellStory>
  ),
};

/** The route's wiring for Legal holds: LegalHolds(holdType, status) and LegalHoldOptions through the app's hooks. */
function ConnectedHolds() {
  const [filters, setFilters] = React.useState<HoldFilters>({
    holdType: "",
    status: "",
  });
  const { holds, loading, error, refetch } = useLegalHolds({
    holdType: filters.holdType || null,
    status: filters.status || null,
  });
  const { holdTypes, statuses } = useLegalHoldOptions();
  return (
    <RetentionScreen
      {...ready}
      tab="legal-holds"
      holds={{
        data: loading && holds.length === 0 ? null : holds,
        loading,
        error,
        retry: () => void refetch(),
      }}
      holdTypes={holdTypes}
      holdStatuses={statuses}
      filters={filters}
      onFiltersChange={setFilters}
    />
  );
}

const connected: Story["render"] = () => (
  <ShellStory path="/settings/retention/legal-holds" defaultAssistantHidden>
    <ConnectedHolds />
  </ShellStory>
);

export const ConnectedToLegalHolds: Story = {
  parameters: { graphql: { mocks: legalHoldMocks.full } },
  render: connected,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("Doe v. Acme"),
    ).toBeInTheDocument();
  },
};

export const ConnectedEmpty: Story = {
  parameters: { graphql: { mocks: legalHoldMocks.empty } },
  render: connected,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("No legal holds"),
    ).toBeInTheDocument();
  },
};

export const ConnectedLoading: Story = {
  parameters: { graphql: { mocks: legalHoldMocks.loading } },
  render: connected,
};

export const ConnectedError: Story = {
  parameters: { graphql: { mocks: legalHoldMocks.error } },
  render: connected,
};
