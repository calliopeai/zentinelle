import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { manyPolicies, policyList } from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { PoliciesScreen, type PoliciesScreenProps } from "./PoliciesScreen";
import { NARROW, resolved } from "./story-helpers";

function Stateful(
  props: Partial<PoliciesScreenProps> & {
    role?: "viewer" | "operator" | "admin";
  },
) {
  const { role = "operator", ...rest } = props;
  const [search, setSearch] = React.useState(rest.search ?? "");
  const [type, setType] = React.useState(rest.type ?? "");
  const [scope, setScope] = React.useState(rest.scope ?? "");
  return (
    <ShellStory path="/policies" role={role} defaultAssistantHidden>
      <PoliciesScreen
        capabilities={capabilitiesOf(role)}
        policies={policyList}
        loading={false}
        onRetry={fn()}
        onSimulate={fn()}
        onAnalyze={fn()}
        onToggleEnabled={resolved()}
        onDuplicate={resolved()}
        onDelete={resolved()}
        {...rest}
        search={search}
        onSearchChange={setSearch}
        type={type}
        onTypeChange={setType}
        scope={scope}
        onScopeChange={setScope}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Policies (All)",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

export const Full: Story = {
  render: () => <Stateful />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "Policies" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("link", { name: /^Monthly spend cap/ }),
    ).toHaveAttribute("href", "/policies/pol-budget-org");
    await expect(
      canvas.getByRole("link", { name: /New policy/ }),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  render: () => <Stateful policies={[]} loading />,
};

export const Empty: Story = { render: () => <Stateful policies={[]} /> };

export const EmptyFiltered: Story = {
  render: () => (
    <Stateful policies={[]} type="network_policy" search="egress" />
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("No policies match"),
    ).toBeInTheDocument();
  },
};

export const Error: Story = {
  render: () => (
    <Stateful
      policies={[]}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};

/** A viewer sees every policy and can simulate or analyze, but has no New, no row menu and no delete. */
export const Viewer: Story = {
  render: () => <Stateful role="viewer" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("link", { name: /New policy/ })).toBeNull();
    await userEvent.click(
      canvas.getByRole("button", { name: "More policy actions" }),
    );
    await expect(
      within(document.body).queryByRole("menuitem", {
        name: "New from a document",
      }),
    ).toBeNull();
  },
};

export const ViewerEmpty: Story = {
  render: () => <Stateful role="viewer" policies={[]} />,
};

export const LongData: Story = {
  render: () => <Stateful policies={manyPolicies} />,
};

export const Narrow: Story = {
  ...NARROW,
  render: () => <Stateful policies={manyPolicies} />,
};

/** Delete asks first, in the house ConfirmDialog. */
export const ConfirmDelete: Story = {
  render: () => <Stateful />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const menu = await canvas.findByRole("button", {
      name: /Support deployment budget/,
    });
    await userEvent.click(menu);
    const body = within(document.body);
    const del = await body.findByRole("menuitem", { name: "Delete" });
    await userEvent.click(del);
    await expect(await body.findByRole("alertdialog")).toBeInTheDocument();
  },
};
