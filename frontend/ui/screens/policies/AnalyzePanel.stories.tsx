import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import {
  ALL_POLICY_TYPES,
  analyzerData,
} from "../../storybook/fixtures/policies";
import { AnalyzePanel } from "./AnalyzePanel";
import { analyzePolicies } from "./map";
import { NARROW } from "./story-helpers";

const analysis = analyzePolicies(analyzerData, ALL_POLICY_TYPES);

const meta = {
  title: "Policies/Panels/Analyze coverage",
  component: AnalyzePanel,
  args: {
    open: true,
    onOpenChange: fn(),
    analysis,
    loading: false,
    onRetry: fn(),
  },
} satisfies Meta<typeof AnalyzePanel>;
export default meta;
type S = StoryObj<typeof meta>;

export const Full: S = {
  play: async () => {
    const body = within(document.body);
    await expect(
      await body.findByText(/Default rate limit, Legacy rate limit/),
    ).toBeInTheDocument();
  },
};
export const Loading: S = { args: { analysis: null, loading: true } };
export const Empty: S = {
  args: {
    analysis: analyzePolicies(
      { policies: [], endpoints: [] },
      ALL_POLICY_TYPES,
    ),
  },
};
export const Error: S = {
  args: {
    analysis: null,
    error: { message: "Something went wrong on the server." },
  },
};
export const Clean: S = {
  args: {
    analysis: analyzePolicies(
      {
        policies: analyzerData.policies.filter(
          (p) => p.enabled && p.id !== "pol-rate-dup",
        ),
        endpoints: analyzerData.endpoints,
      },
      [
        "budget_limit",
        "network_policy",
        "human_oversight",
        "rate_limit",
        "tool_permission",
      ],
    ),
  },
};
export const Narrow: S = { ...NARROW };
