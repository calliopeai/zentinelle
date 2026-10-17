import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { simulation, simulationQuiet } from "../../storybook/fixtures/policies";
import { typeOptions } from "./labels";
import { SimulatePanel } from "./SimulatePanel";
import { NARROW } from "./story-helpers";

const meta = {
  title: "Policies/Panels/Simulate",
  component: SimulatePanel,
  args: {
    open: true,
    onOpenChange: fn(),
    types: typeOptions().filter((o) => o.value),
    initial: {
      policyType: "network_policy",
      config: { allowed_outbound_domains: ["api.openai.com"] },
    },
    onRun: fn(),
    result: null,
    running: false,
  },
} satisfies Meta<typeof SimulatePanel>;
export default meta;
type S = StoryObj<typeof meta>;

export const Ready: S = {};
export const Running: S = { args: { running: true } };
export const Result: S = { args: { result: simulation.simulatePolicy } };
export const NoEvents: S = { args: { result: simulationQuiet.simulatePolicy } };
export const Error: S = {
  args: {
    error: {
      message: "simulatePolicy needs a policy type the evaluator knows.",
    },
  },
};
export const InvalidConfig: S = {
  play: async ({ args }) => {
    const body = within(document.body);
    const box = await body.findByRole("textbox", { name: "Configuration" });
    await userEvent.clear(box);
    await userEvent.type(box, "not json");
    await userEvent.click(body.getByRole("button", { name: "Run simulation" }));
    await expect(
      body.getByText("The configuration is not valid JSON."),
    ).toBeInTheDocument();
    await expect(args.onRun).not.toHaveBeenCalled();
  },
};
export const LongSamples: S = {
  args: {
    result: {
      ...simulation.simulatePolicy,
      blockedSamples: Array.from(
        { length: 10 },
        (_, i) =>
          `agent-${i}: POST https://exfil-${i}.a-very-long-domain-name-for-testing.example.com/upload?payload=${"x".repeat(60)}`,
      ),
    },
  },
};
export const Narrow: S = {
  ...NARROW,
  args: { result: simulation.simulatePolicy },
};
