import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ShellStory } from "../../storybook/ShellStory";
import { canaryResults } from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { RouteCheckScreen } from "./RouteCheckScreen";
import { NARROW } from "./stories";

const meta = {
  title: "Screens/Models & usage/Route check",
  component: RouteCheckScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("admin"),
    results: canaryResults,
    onRetry: fn(),
    onRun: fn(),
    onRollback: fn(),
  },
  render: (args) => (
    <ShellStory path="/models/routes" role="admin" defaultAssistantHidden>
      <RouteCheckScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof RouteCheckScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};

export const Loading: Story = { args: { results: [], loading: true } };

export const Empty: Story = { args: { results: [] } };

export const Error: Story = {
  args: { results: [], error: { message: "Unable to load canary history" } },
};

export const Running: Story = { args: { running: true } };

export const RunFailed: Story = {
  args: { runError: "Provider is not configured for this organization." },
};

/** An operator who follows a shared link: a clean refusal, not an empty page. */
export const Operator: Story = {
  args: { capabilities: capabilitiesOf("operator") },
  render: (args) => (
    <ShellStory path="/models/routes" role="operator" defaultAssistantHidden>
      <RouteCheckScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Route check needs the admin role"),
    ).toBeInTheDocument();
  },
};

export const LongStrings: Story = {
  args: {
    results: [
      {
        id: "x",
        provider: "bedrock",
        model:
          "us.anthropic.claude-opus-4-5-20251101-v1:0-cross-region-inference-profile",
        status: "failed",
        reason:
          "Denied by network policy prod-egress-allowlist: the inference profile resolves to us-west-2, which is outside the regions the production tier allows for regulated data.",
        created_at: "2026-10-16T09:12:00Z",
      },
      ...canaryResults,
    ],
  },
};

export const Narrow: Story = { ...NARROW };

export const RunsAndRollsBack: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Provider" }),
      "openai",
    );
    await userEvent.type(
      canvas.getByRole("textbox", { name: "Model id" }),
      "gpt-4.1",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Run check" }));
    await expect(args.onRun).toHaveBeenCalledWith({
      provider: "openai",
      model: "gpt-4.1",
    });
    await userEvent.click(
      canvas.getByRole("button", {
        name: "Roll back anthropic/claude-sonnet-4-5",
      }),
    );
    await expect(args.onRollback).toHaveBeenCalledWith("c1");
  },
};
