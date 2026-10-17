import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  budgetPolicy,
  longPolicy,
  policyDiff,
  policyVersions,
  simulation,
  simulationQuiet,
} from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import type { PolicyTab } from "./frame";
import {
  PolicyDetailScreen,
  type PolicyDetailScreenProps,
} from "./PolicyDetailScreen";
import { NARROW, resolved } from "./story-helpers";

function Story(
  props: Partial<PolicyDetailScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [compared, setCompared] = React.useState(false);
  const policy = rest.policy === undefined ? budgetPolicy : rest.policy;
  return (
    <ShellStory
      path={`/policies/${policy?.id ?? "missing"}`}
      role={role}
      defaultAssistantHidden
    >
      <PolicyDetailScreen
        capabilities={capabilitiesOf(role)}
        loading={false}
        onRetry={fn()}
        tab="overview"
        effect={{
          data: simulation.simulatePolicy,
          loading: false,
          onRetry: fn(),
        }}
        history={{ data: policyVersions, loading: false, onRetry: fn() }}
        diff={compared ? { data: policyDiff, loading: false } : undefined}
        onCompare={() => setCompared(true)}
        onSimulate={fn()}
        onAskAssistant={fn()}
        onToggleEnabled={resolved()}
        onDuplicate={resolved()}
        onDelete={resolved()}
        {...rest}
        policy={policy}
      />
    </ShellStory>
  );
}

const tab = (t: PolicyTab) => ({ render: () => <Story tab={t} /> });

const meta = {
  title: "Policies/Screens/Policy detail",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Overview: S = {
  ...tab("overview"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Monthly spend cap" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: "Scope and effect" }),
    ).toHaveAttribute("href", "/policies/pol-budget-org?tab=scope");
  },
};
export const Configuration: S = tab("configuration");
export const ScopeAndEffect: S = tab("scope");
export const ScopeEffectLoading: S = {
  render: () => (
    <Story tab="scope" effect={{ data: null, loading: true, onRetry: fn() }} />
  ),
};
export const ScopeEffectNoEvents: S = {
  render: () => (
    <Story
      tab="scope"
      effect={{
        data: simulationQuiet.simulatePolicy,
        loading: false,
        onRetry: fn(),
      }}
    />
  ),
};
export const ScopeEffectError: S = {
  render: () => (
    <Story
      tab="scope"
      effect={{
        data: null,
        loading: false,
        error: { message: "simulatePolicy failed." },
        onRetry: fn(),
      }}
    />
  ),
};
export const History: S = {
  ...tab("history"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Compare with v2" }),
    );
    await expect(await canvas.findByText("v2 to v3")).toBeInTheDocument();
  },
};
export const HistoryEmpty: S = {
  render: () => (
    <Story
      tab="history"
      history={{ data: [], loading: false, onRetry: fn() }}
    />
  ),
};
export const HistoryLoading: S = {
  render: () => (
    <Story tab="history" history={{ data: [], loading: true, onRetry: fn() }} />
  ),
};
export const HistoryError: S = {
  render: () => (
    <Story
      tab="history"
      history={{
        data: [],
        loading: false,
        error: { message: "history: 403" },
        onRetry: fn(),
      }}
    />
  ),
};
export const Loading: S = { render: () => <Story policy={null} loading /> };
export const NotFound: S = { render: () => <Story policy={null} /> };
export const Error: S = {
  render: () => (
    <Story
      policy={null}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};

/** A viewer reads every tab; the menu holds only Ask the assistant, and Configuration has no Edit. */
export const Viewer: S = {
  render: () => <Story role="viewer" tab="configuration" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link", { name: "Edit" })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "More actions for this policy" }),
    );
    const body = within(document.body);
    await expect(
      await body.findByRole("menuitem", { name: "Ask the assistant" }),
    ).toBeInTheDocument();
    await expect(body.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  },
};
export const Off: S = {
  render: () => <Story policy={{ ...budgetPolicy, enabled: false }} />,
};
export const LongData: S = {
  render: () => <Story policy={longPolicy} tab="configuration" />,
};
export const LongOverview: S = { render: () => <Story policy={longPolicy} /> };
export const Narrow: S = {
  ...NARROW,
  render: () => <Story policy={longPolicy} />,
};
