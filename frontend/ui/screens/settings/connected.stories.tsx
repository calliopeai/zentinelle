import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";

import {
  apiKeyMocks,
  astroliftInstalls,
  enrollmentCode,
  legalHoldMocks,
  organizationMocks,
  retentionMocks,
  runtime,
} from "../../storybook/fixtures/settings";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import {
  ApiKeysConnected,
  GeneralConnected,
  IntegrationsConnected,
  RetentionConnected,
  SettingsAssistantConnected,
  type SettingsRestClient,
} from "./connected";

const done = async () => ({});

/** The area's REST calls, answered from fixtures. */
const rest: SettingsRestClient = {
  runtime: async () => runtime,
  stage: done,
  transition: done,
  rollback: done,
  installs: async () => astroliftInstalls,
  enrollmentCode: async () => enrollmentCode,
  disconnect: done,
  revokeCluster: done,
};

/**
 * The containers on the app's own hooks and documents, answered by the
 * foundation's MockLink and the fixtures above: what each route renders.
 */
const meta = {
  title: "Settings/Connected",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

const admin = capabilitiesOf("admin");

export const General: S = {
  parameters: { graphql: { mocks: organizationMocks.full } },
  render: () => (
    <ShellStory path="/settings" role="admin" defaultAssistantHidden>
      <GeneralConnected capabilities={admin} tab="organization" client={rest} />
    </ShellStory>
  ),
};

export const Runtime: S = {
  parameters: { graphql: { mocks: organizationMocks.full } },
  render: () => (
    <ShellStory
      path="/settings?tab=runtime"
      role="admin"
      defaultAssistantHidden
    >
      <GeneralConnected capabilities={admin} tab="runtime" client={rest} />
    </ShellStory>
  ),
};

/** Settings is admin-only: an operator gets the 403 page. */
export const Forbidden: S = {
  render: () => (
    <ShellStory path="/settings" role="operator" defaultAssistantHidden>
      <GeneralConnected
        capabilities={capabilitiesOf("operator")}
        tab="organization"
        client={rest}
      />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", { name: "General" });
  },
};

export const Assistant: S = {
  render: () => (
    <ShellStory path="/settings/assistant" role="admin" defaultAssistantHidden>
      <SettingsAssistantConnected capabilities={admin} client={rest} />
    </ShellStory>
  ),
};

export const ApiKeys: S = {
  parameters: { graphql: { mocks: apiKeyMocks.full } },
  render: () => (
    <ShellStory path="/settings/api-keys" role="admin" defaultAssistantHidden>
      <ApiKeysConnected capabilities={admin} />
    </ShellStory>
  ),
};

export const Integrations: S = {
  render: () => (
    <ShellStory path="/settings/astrolift" role="admin" defaultAssistantHidden>
      <IntegrationsConnected
        capabilities={admin}
        client={rest}
        zentinelleUrl="https://zentinelle.example.com"
      />
    </ShellStory>
  ),
};

export const Retention: S = {
  parameters: {
    graphql: { mocks: [...retentionMocks.full, ...legalHoldMocks.full] },
  },
  render: () => (
    <ShellStory path="/settings/retention" role="admin" defaultAssistantHidden>
      <RetentionConnected capabilities={admin} tab="policies" />
    </ShellStory>
  ),
};

export const LegalHolds: S = {
  parameters: {
    graphql: { mocks: [...retentionMocks.full, ...legalHoldMocks.full] },
  },
  render: () => (
    <ShellStory
      path="/settings/retention/legal-holds"
      role="admin"
      defaultAssistantHidden
    >
      <RetentionConnected capabilities={admin} tab="legal-holds" />
    </ShellStory>
  ),
};
