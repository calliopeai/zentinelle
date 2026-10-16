import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, within } from "storybook/test";

import { manyPolicies, policyList } from "../../storybook/fixtures/policies";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { hierarchyOf } from "./map";
import {
  PolicyHierarchyScreen,
  type PolicyHierarchyScreenProps,
} from "./PolicyHierarchyScreen";
import { NARROW } from "./story-helpers";

function Story(
  props: Partial<PolicyHierarchyScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [type, setType] = React.useState(rest.type ?? "");
  return (
    <ShellStory path="/policies/hierarchy" role={role} defaultAssistantHidden>
      <PolicyHierarchyScreen
        capabilities={capabilitiesOf(role)}
        tiers={hierarchyOf(
          policyList.filter((p) => !type || p.policyType === type),
        )}
        loading={false}
        onRetry={fn()}
        {...rest}
        type={type}
        onTypeChange={setType}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Hierarchy",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Full: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "1. Organization" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText("overrides organization"),
    ).toBeInTheDocument();
  },
};
export const Loading: S = { render: () => <Story tiers={[]} loading /> };
export const Empty: S = { render: () => <Story tiers={[]} /> };
export const EmptyFiltered: S = {
  render: () => <Story tiers={[]} type="data_access" />,
};
export const Error: S = {
  render: () => (
    <Story
      tiers={[]}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};
export const Viewer: S = { render: () => <Story role="viewer" /> };
export const LongData: S = {
  render: () => <Story tiers={hierarchyOf(manyPolicies)} />,
};
export const Narrow: S = {
  ...NARROW,
  render: () => <Story tiers={hierarchyOf(manyPolicies)} />,
};
