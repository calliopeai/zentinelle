import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { useAIModels } from "@/graphql/models/hooks";

import type { Role } from "../../product";
import { ShellStory } from "../../storybook/ShellStory";
import {
  aiModelMocks,
  aiModels,
  longAiModels,
} from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { ModelsScreen } from "./ModelsScreen";
import { providerOptions } from "./models";
import { NARROW } from "./stories";

const models = aiModels.aiModels;

const meta = {
  title: "Screens/Models & usage/Models",
  component: ModelsScreen,
  parameters: { layout: "fullscreen" },
  args: {
    capabilities: capabilitiesOf("admin"),
    models,
    onRetry: fn(),
    search: "",
    onSearchChange: fn(),
    provider: "",
    onProviderChange: fn(),
    providers: providerOptions(models),
    estimate: null,
    onEstimate: fn(),
  },
  render: (args) => (
    <ShellStory path="/models" role="admin" defaultAssistantHidden>
      <ModelsScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof ModelsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Route check" }),
    ).toHaveAttribute("href", "/models/routes");
    await expect(canvas.getByText("Claude Sonnet 4.5")).toBeInTheDocument();
  },
};

export const Loading: Story = { args: { models: [], loading: true } };

export const Empty: Story = { args: { models: [] } };

export const EmptyFiltered: Story = {
  args: { models: [], search: "llama", provider: "openai" },
};

export const Error: Story = {
  args: { models: [], error: { message: "Failed to load models." } },
};

/** A viewer: no Route check tab, no Providers row, and the empty state says who adds keys. */
export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/models" role="viewer" defaultAssistantHidden>
      <ModelsScreen {...args} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("link", { name: "Route check" }),
    ).toBeNull();
    await expect(canvas.queryByRole("link", { name: "Providers" })).toBeNull();
  },
};

export const LongStrings: Story = {
  args: {
    models: longAiModels.aiModels,
    providers: providerOptions(longAiModels.aiModels),
  },
};

export const Narrow: Story = { ...NARROW };

export const EstimateOpen: Story = { args: { estimate: { modelId: "m3" } } };

export const SelectsToCompare: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("checkbox", { name: /Claude Sonnet 4\.5/ }),
    );
    await userEvent.click(canvas.getByRole("checkbox", { name: /GPT-4\.1/ }));
    await expect(
      canvas.getByRole("link", { name: "Compare 2" }),
    ).toHaveAttribute("href", "/models/compare?ids=m1,m3");
  },
};

export const OpensEstimate: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Estimate cost" }),
    );
    await expect(args.onEstimate).toHaveBeenCalledWith({});
  },
};

/** The route's wiring: the app's own hook, answered by the AiModels mocks. */
function Connected({ role }: { role: Role }) {
  const [search, setSearch] = React.useState("");
  const [provider, setProvider] = React.useState("");
  const [estimate, setEstimate] = React.useState<{ modelId?: string } | null>(
    null,
  );
  const result = useAIModels({
    availableOnly: true,
    search: search || null,
    providerSlug: provider || null,
  });
  return (
    <ShellStory path="/models" role={role} defaultAssistantHidden>
      <ModelsScreen
        capabilities={capabilitiesOf(role)}
        models={result.models}
        loading={result.loading}
        error={result.error}
        onRetry={() => void result.refetch()}
        search={search}
        onSearchChange={setSearch}
        provider={provider}
        onProviderChange={setProvider}
        providers={providerOptions(result.models)}
        estimate={estimate}
        onEstimate={setEstimate}
      />
    </ShellStory>
  );
}

export const ConnectedFull: Story = {
  parameters: { graphql: { mocks: aiModelMocks.full } },
  render: () => <Connected role="operator" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() =>
      expect(canvas.getByText("Gemini 2.5 Pro")).toBeInTheDocument(),
    );
  },
};

export const ConnectedEmpty: Story = {
  parameters: { graphql: { mocks: aiModelMocks.empty } },
  render: () => <Connected role="operator" />,
};

export const ConnectedLoading: Story = {
  parameters: { graphql: { mocks: aiModelMocks.loading } },
  render: () => <Connected role="operator" />,
};

export const ConnectedError: Story = {
  parameters: { graphql: { mocks: aiModelMocks.error } },
  render: () => <Connected role="operator" />,
};
