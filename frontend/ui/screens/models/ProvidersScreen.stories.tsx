import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { ShellStory } from "../../storybook/ShellStory";
import {
  availableProviders,
  providerModels,
  storedKeys,
} from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { ProvidersScreen } from "./ProvidersScreen";
import { toProviderRows } from "./providers";
import { NARROW } from "./stories";

const rows = toProviderRows(availableProviders, storedKeys);

const meta = {
  title: "Screens/Models & usage/Providers",
  component: ProvidersScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("admin"),
    providers: rows,
    onRetry: fn(),
    filter: "all",
    onFilterChange: fn(),
    onSaveKey: fn(),
    onRemoveKey: fn(),
    onToggleAssistant: fn(),
    modelsDialog: null,
    onModelsDialogChange: fn(),
    onSaveModels: fn(),
  },
  render: (args) => (
    <ShellStory path="/models/providers" role="admin" defaultAssistantHidden>
      <ProvidersScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof ProvidersScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("4 of 24")).toBeInTheDocument();
    await expect(
      canvas.getByRole("switch", {
        name: "Available in the assistant for Anthropic",
      }),
    ).toHaveAttribute("aria-checked", "true");
  },
};

export const Configured: Story = { args: { filter: "configured" } };

export const Loading: Story = { args: { providers: [], loading: true } };

/** Nothing configured anywhere: the Configured view is empty. */
export const EmptyFiltered: Story = {
  args: { providers: toProviderRows([], []), filter: "configured" },
};

export const Error: Story = {
  args: { providers: [], error: { message: "Unable to load providers" } },
};

/** An operator on a shared link: Providers is admin-only. */
export const Operator: Story = {
  args: { capabilities: capabilitiesOf("operator") },
  render: (args) => (
    <ShellStory path="/models/providers" role="operator" defaultAssistantHidden>
      <ProvidersScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText("Providers needs the admin role"),
    ).toBeInTheDocument();
  },
};

export const LongStrings: Story = {
  args: {
    providers: rows.map((r) =>
      r.id === "anthropic"
        ? {
            ...r,
            label:
              "Anthropic through the regulated-tier private endpoint in eu-central-1",
          }
        : r,
    ),
  },
};

export const Narrow: Story = { ...NARROW };

export const ModelsDialogOpen: Story = {
  args: { modelsDialog: { provider: "anthropic", models: providerModels } },
};

export const ModelsDialogLoading: Story = {
  args: { modelsDialog: { provider: "anthropic", models: null } },
};

export const AddsAKey: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Add a Google key" }),
    );
    await userEvent.type(body.getByLabelText("API key"), "AIza-test");
    await userEvent.click(body.getByRole("button", { name: "Save key" }));
    await expect(args.onSaveKey).toHaveBeenCalledWith("google", "AIza-test");
  },
};

export const RemovesAKey: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(
      canvas.getByRole("button", { name: "Remove the OpenAI key" }),
    );
    await userEvent.click(body.getByRole("button", { name: "Remove key" }));
    await expect(args.onRemoveKey).toHaveBeenCalledWith("openai");
  },
};

export const TogglesAssistant: Story = {
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("switch", {
        name: "Available in the assistant for OpenAI",
      }),
    );
    await expect(args.onToggleAssistant).toHaveBeenCalledWith("openai", true);
  },
};
