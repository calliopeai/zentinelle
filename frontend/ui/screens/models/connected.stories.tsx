import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { within } from "storybook/test";

import {
  FIXTURE_END,
  aiModelMocks,
  availableProviders,
  canaryResults,
  providerModels,
  showback,
  storedKeys,
  usageMocks,
} from "../../storybook/fixtures/models";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  AnomaliesConnected,
  BudgetsConnected,
  CompareModelsConnected,
  ModelsConnected,
  ProvidersConnected,
  RouteCheckConnected,
  UsageOverviewConnected,
  type ModelsRestClient,
} from "./connected";

const done = async () => ({});

/** The area's REST calls, answered from fixtures. */
const rest: ModelsRestClient = {
  showback: async () => showback,
  canaries: async () => canaryResults,
  runCanary: done,
  rollback: done,
  providers: async () => ({
    available: availableProviders,
    stored: storedKeys,
  }),
  saveKey: done,
  removeKey: done,
  setAssistant: done,
  providerModels: async () => providerModels,
  saveProviderModels: done,
};

/**
 * The containers on the app's own hooks and documents, answered by the
 * foundation's MockLink and the fixtures above: what each route renders.
 */
const meta = {
  title: "Models & usage/Connected",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

const operator = capabilitiesOf("operator");
const admin = capabilitiesOf("admin");
const end = new Date(FIXTURE_END);

export const Usage: S = {
  parameters: { graphql: { mocks: usageMocks.full } },
  render: () => (
    <ShellStory path="/usage" role="operator" defaultAssistantHidden>
      <UsageOverviewConnected capabilities={operator} now={end} />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("$412.88");
  },
};

export const Anomalies: S = {
  parameters: { graphql: { mocks: usageMocks.full } },
  render: () => (
    <ShellStory path="/usage/anomalies" role="operator" defaultAssistantHidden>
      <AnomaliesConnected capabilities={operator} now={end} />
    </ShellStory>
  ),
};

export const Budgets: S = {
  render: () => (
    <ShellStory path="/usage/budgets" role="operator" defaultAssistantHidden>
      <BudgetsConnected capabilities={operator} client={rest} />
    </ShellStory>
  ),
};

function Models() {
  const [estimate, setEstimate] = React.useState<{ modelId?: string } | null>(
    null,
  );
  return (
    <ModelsConnected
      capabilities={operator}
      estimate={estimate}
      onEstimate={setEstimate}
    />
  );
}

export const ModelsList: S = {
  parameters: { graphql: { mocks: aiModelMocks.full } },
  render: () => (
    <ShellStory path="/models" role="operator" defaultAssistantHidden>
      <Models />
    </ShellStory>
  ),
};

function Compare() {
  const [ids, setIds] = React.useState<string[]>([]);
  return (
    <CompareModelsConnected
      capabilities={operator}
      selectedIds={ids}
      onSelectedChange={setIds}
    />
  );
}

export const CompareModels: S = {
  parameters: { graphql: { mocks: aiModelMocks.full } },
  render: () => (
    <ShellStory path="/models/compare" role="operator" defaultAssistantHidden>
      <Compare />
    </ShellStory>
  ),
};

export const RouteCheck: S = {
  render: () => (
    <ShellStory path="/models/routes" role="admin" defaultAssistantHidden>
      <RouteCheckConnected capabilities={admin} client={rest} />
    </ShellStory>
  ),
};

export const Providers: S = {
  render: () => (
    <ShellStory path="/models/providers" role="admin" defaultAssistantHidden>
      <ProvidersConnected capabilities={admin} client={rest} />
    </ShellStory>
  ),
};

export const ProvidersFailed: S = {
  render: () => (
    <ShellStory path="/models/providers" role="admin" defaultAssistantHidden>
      <ProvidersConnected
        capabilities={admin}
        client={{
          ...rest,
          providers: async () => {
            throw new globalThis.Error("");
          },
        }}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(
      "The providers could not be loaded.",
    );
  },
};
