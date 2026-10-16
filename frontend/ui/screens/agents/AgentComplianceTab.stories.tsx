import type { Meta, StoryObj } from "@storybook/react-vite";

import type { ContentViolationData } from "@/graphql/content-scanner/types";

import { violations } from "../../storybook/fixtures/agents";
import { fixtureController } from "../../storybook/table";
import { AgentComplianceTab } from "./AgentComplianceTab";

/** Compliance: GetContentViolations for one agent. */
const meta = {
  title: "Screens/Agents/Tabs/Compliance",
  component: AgentComplianceTab,
  args: {
    table: fixtureController<ContentViolationData>({
      rows: violations.contentViolations,
    }),
    detectionsHref: "/content-rules/detections?agent=support-bot",
  },
} satisfies Meta<typeof AgentComplianceTab>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Loading: Story = {
  args: {
    table: fixtureController<ContentViolationData>({
      state: "loading",
      totalCount: null,
    }),
  },
};
export const Empty: Story = {
  args: { table: fixtureController<ContentViolationData>() },
};
export const LoadFailed: Story = {
  args: {
    table: fixtureController<ContentViolationData>({
      state: "error",
      error: { message: "Something went wrong on the server." },
    }),
  },
};
export const LongData: Story = {
  args: {
    table: fixtureController<ContentViolationData>({
      rows: [
        {
          ...violations.contentViolations[0],
          id: "vio-long",
          ruleName:
            "Payment card numbers in any of the forty supported locales, including partial matches",
          ruleTypeDisplay:
            "Personally identifiable information detection, regulated tier",
        },
        ...violations.contentViolations,
      ],
    }),
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
