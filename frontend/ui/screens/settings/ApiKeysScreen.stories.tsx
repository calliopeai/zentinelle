import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { useApiKeys } from "@/graphql/api-keys/hooks";

import {
  NARROW,
  apiKeyMocks,
  apiKeys,
  createdApiKey,
  longApiKeys,
} from "../../storybook/fixtures/settings";
import { ShellStory } from "../../storybook/ShellStory";
import { ApiKeysScreen, type ApiKeysScreenProps } from "./ApiKeysScreen";
import { SettingsForbiddenScreen } from "./SettingsForbiddenScreen";

const callbacks = {
  onSearchChange: fn(),
  onCreate: fn(async () => {}),
  onRevoke: fn(async () => {}),
  onDelete: fn(async () => {}),
  onDismissCreated: fn(),
};

const meta = {
  title: "Settings/Screens/API keys",
  component: ApiKeysScreen,
  parameters: { layout: "fullscreen" },
  args: { keys: { data: apiKeys.apiKeys }, search: "", ...callbacks },
  render: (args) => (
    <ShellStory path="/settings/api-keys" defaultAssistantHidden>
      <ApiKeysScreen {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof ApiKeysScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("heading", { name: "API keys" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("ci-policy-sync")).toBeInTheDocument();
  },
};

export const Empty: Story = { args: { keys: { data: [] } } };

export const EmptyFiltered: Story = {
  args: { keys: { data: [] }, search: "nothing-like-this" },
};

export const Loading: Story = { args: { keys: { data: null, loading: true } } };

export const Failed: Story = {
  args: {
    keys: { data: null, error: { message: "Network error" }, retry: fn() },
  },
};

export const LongData: Story = {
  args: { keys: { data: longApiKeys.apiKeys } },
};

export const Narrow: Story = { ...NARROW };

/** After a create: the key in full, once, above the list. */
export const JustCreated: Story = {
  args: { created: createdApiKey },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(createdApiKey.apiKey)).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "I have copied it" }),
    );
    await expect(callbacks.onDismissCreated).toHaveBeenCalled();
  },
};

export const OpensNewKey: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "New API key" }),
    );
    await expect(
      await within(canvasElement.ownerDocument.body).findByRole("dialog"),
    ).toBeInTheDocument();
  },
};

export const Viewer: Story = {
  render: () => (
    <ShellStory path="/settings/api-keys" role="viewer" defaultAssistantHidden>
      <SettingsForbiddenScreen title="API keys" />
    </ShellStory>
  ),
};

/** The route's wiring: ApiKeys(search) through the app's own hook, answered by the story mocks. */
function Connected(
  props: Omit<ApiKeysScreenProps, "keys" | "search" | "onSearchChange">,
) {
  const [search, setSearch] = React.useState("");
  const { keys, loading, error, refetch } = useApiKeys({
    search: search || undefined,
  });
  return (
    <ApiKeysScreen
      {...props}
      keys={{
        data: loading && keys.length === 0 ? null : keys,
        loading,
        error,
        retry: () => void refetch(),
      }}
      search={search}
      onSearchChange={setSearch}
    />
  );
}

const connected: Story["render"] = (args) => (
  <ShellStory path="/settings/api-keys" defaultAssistantHidden>
    <Connected {...args} />
  </ShellStory>
);

export const ConnectedToApiKeys: Story = {
  parameters: { graphql: { mocks: apiKeyMocks.full } },
  render: connected,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("grafana-usage"),
    ).toBeInTheDocument();
  },
};

export const ConnectedEmpty: Story = {
  parameters: { graphql: { mocks: apiKeyMocks.empty } },
  render: connected,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("No API keys yet"),
    ).toBeInTheDocument();
  },
};

export const ConnectedLoading: Story = {
  parameters: { graphql: { mocks: apiKeyMocks.loading } },
  render: connected,
};

export const ConnectedError: Story = {
  parameters: { graphql: { mocks: apiKeyMocks.error } },
  render: connected,
};
