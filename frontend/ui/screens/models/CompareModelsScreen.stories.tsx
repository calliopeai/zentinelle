import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { ShellStory } from "../../storybook/ShellStory";
import { aiModels, longAiModels } from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { CompareModelsScreen } from "./CompareModelsScreen";
import { NARROW } from "./stories";

const meta = {
  title: "Screens/Models & usage/Compare models",
  component: CompareModelsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("operator"),
    models: aiModels.aiModels,
    selectedIds: ["m1", "m3", "m4"],
    onSelectedChange: fn(),
    onRetry: fn(),
  },
  render: (args) => (
    <ShellStory path="/models/compare" role="operator" defaultAssistantHidden>
      <CompareModelsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof CompareModelsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("lowest").length).toBeGreaterThan(0);
    await expect(canvas.getAllByText("highest").length).toBeGreaterThan(0);
  },
};

export const Loading: Story = { args: { loading: true } };

export const Empty: Story = { args: { selectedIds: [] } };

export const Error: Story = {
  args: { models: [], error: { message: "Failed to load models." } },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/models/compare" role="viewer" defaultAssistantHidden>
      <CompareModelsScreen {...args} />
    </ShellStory>
  ),
};

export const AtTheLimit: Story = {
  args: { selectedIds: ["m1", "m2", "m3", "m4"] },
};

export const LongStrings: Story = {
  args: { models: longAiModels.aiModels, selectedIds: ["l1", "m5"] },
};

export const Narrow: Story = { ...NARROW };

export const AddsAndRemoves: Story = {
  render: function Render(args) {
    const [ids, setIds] = React.useState<string[]>(["m1"]);
    return (
      <ShellStory path="/models/compare" role="operator" defaultAssistantHidden>
        <CompareModelsScreen
          {...args}
          selectedIds={ids}
          onSelectedChange={(next) => {
            setIds(next);
            args.onSelectedChange(next);
          }}
        />
      </ShellStory>
    );
  },
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByRole("combobox", { name: "Add a model" }),
      "m2",
    );
    await expect(args.onSelectedChange).toHaveBeenLastCalledWith(["m1", "m2"]);
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove Claude Sonnet 4.5" }),
    );
    await expect(args.onSelectedChange).toHaveBeenLastCalledWith(["m2"]);
  },
};
