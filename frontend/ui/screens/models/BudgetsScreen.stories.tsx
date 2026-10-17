import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ShellStory } from "../../storybook/ShellStory";
import {
  emptyShowback,
  longShowback,
  showback,
} from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { BudgetsScreen } from "./BudgetsScreen";
import { NARROW } from "./stories";

const meta = {
  title: "Screens/Models & usage/Budgets",
  component: BudgetsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("operator"),
    group: "endpoint",
    onGroupChange: fn(),
    report: showback,
    onRetry: fn(),
    onRefresh: fn(),
  },
  render: (args) => (
    <ShellStory path="/usage/budgets" role="operator" defaultAssistantHidden>
      <BudgetsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof BudgetsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Budget policies" }),
    ).toHaveAttribute("href", "/policies?type=budget_limit");
    await expect(canvas.getByText("anomaly")).toBeInTheDocument();
    await expect(canvas.getByText("Unassigned")).toBeInTheDocument();
  },
};

export const Loading: Story = { args: { report: null, loading: true } };

/** Changing the grouping keeps the last answer on screen until the next lands. */
export const Refetching: Story = { args: { loading: true } };

export const Empty: Story = { args: { report: emptyShowback } };

export const Error: Story = {
  args: {
    report: null,
    error: { message: "Unable to load budget showback" },
  },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/usage/budgets" role="viewer" defaultAssistantHidden>
      <BudgetsScreen {...args} />
    </ShellStory>
  ),
};

export const LongStrings: Story = { args: { report: longShowback } };

export const Narrow: Story = { ...NARROW };

export const GroupsByTeam: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Group by" }),
      "team",
    );
    await expect(args.onGroupChange).toHaveBeenCalledWith("team");
  },
};
