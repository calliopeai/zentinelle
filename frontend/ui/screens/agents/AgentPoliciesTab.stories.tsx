import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import {
  effectivePolicies,
  toolPermissions,
} from "../../storybook/fixtures/agents";
import { fixtureController } from "../../storybook/table";
import { AgentPoliciesTab, type EffectivePolicyRow } from "./AgentPoliciesTab";

/** Policies (new): GET /effective-policy?endpoint= for one agent. Rows open the policy. */
const meta = {
  title: "Screens/Agents/Tabs/Policies",
  component: AgentPoliciesTab,
  args: {
    table: fixtureController<EffectivePolicyRow>({ rows: effectivePolicies }),
    tools: toolPermissions,
    effectiveHref: "/policies/effective?agent=support-bot",
  },
} satisfies Meta<typeof AgentPoliciesTab>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: /Support budget/ }),
    ).toHaveAttribute("href", "/policies/pol-1");
  },
};
export const Loading: Story = {
  args: {
    table: fixtureController<EffectivePolicyRow>({
      state: "loading",
      totalCount: null,
    }),
    tools: null,
  },
};
export const Empty: Story = {
  args: {
    table: fixtureController<EffectivePolicyRow>(),
    tools: { allowed: [], denied: [], requires_approval: [] },
  },
};
export const LoadFailed: Story = {
  args: {
    table: fixtureController<EffectivePolicyRow>({
      state: "error",
      error: { message: "Policies could not be loaded." },
    }),
    tools: null,
  },
};
export const LongData: Story = {
  args: {
    table: fixtureController<EffectivePolicyRow>({
      rows: [
        {
          id: "pol-long",
          name: "Regulated data handling for the EMEA enterprise tier, including the processing addendum",
          type: "data_retention",
          scope: "sub_organization",
          priority: 100000,
          enforcement: "enforce",
        },
        ...effectivePolicies,
      ],
    }),
    tools: {
      ...toolPermissions,
      allowed: Array.from(
        { length: 18 },
        (_, i) => `mcp__enterprise_crm__tool_${i}_with_a_long_name`,
      ),
    },
  },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-192">
        <Story />
      </div>
    ),
  ],
};
