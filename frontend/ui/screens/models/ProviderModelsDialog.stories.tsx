import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { providerModels } from "../../storybook/fixtures/models";
import { ProviderModelsDialog } from "./ProviderModelsDialog";

const meta = {
  title: "Screens/Models & usage/Provider models dialog",
  component: ProviderModelsDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    providerLabel: "Anthropic",
    models: providerModels,
    onRetry: fn(),
    onSave: fn(),
  },
} satisfies Meta<typeof ProviderModelsDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText("2 of 4 on")).toBeInTheDocument();
    await userEvent.click(
      body.getByRole("checkbox", { name: /Claude Opus 4\.1/ }),
    );
    await userEvent.click(body.getByRole("button", { name: "Save" }));
    await expect(args.onSave).toHaveBeenCalledWith([
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-opus-4-1",
    ]);
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
  },
};

export const Loading: Story = { args: { models: null } };

export const Empty: Story = { args: { models: [] } };

export const EmptyFiltered: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(
      body.getByRole("searchbox", { name: "Filter models" }),
      "gpt",
    );
    await expect(
      body.getByText("No models match the filter."),
    ).toBeInTheDocument();
  },
};

export const Error: Story = {
  args: { models: null, error: { message: "Unable to load models" } },
};

export const LongStrings: Story = {
  args: {
    models: [
      {
        id: "x",
        model_id:
          "us.anthropic.claude-opus-4-5-20251101-v1:0-cross-region-inference-profile",
        name: "Claude Opus 4.5 through the cross-region inference profile for regulated workloads",
        context_window: 200_000,
        enabled_for_chat: true,
        deprecated: false,
      },
      ...providerModels,
    ],
  },
};
