import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";

import {
  agentMutationMocks,
  agentsMocks,
  groupsMocks,
  longEndpoints,
  manyEndpoints,
} from "../../storybook/fixtures/agents";
import { mockQuery } from "../../storybook/graphql";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { narrow } from "../../storybook/viewport";
import { GET_ENDPOINTS } from "@/graphql/agents/queries";
import { AgentsRoute } from "./AgentsRoute";

/**
 * The Agents route as `app/(app)/agents` will mount it: the app's own
 * GetEndpoints hook and endpoint mutations, answered by the story mocks.
 */
const meta = {
  title: "Screens/Agents/Routes/Agents",
  component: AgentsRoute,
  parameters: {
    layout: "fullscreen",
    graphql: { mocks: agentsMocks.full },
  },
  args: { capabilities: capabilitiesOf("operator") },
  render: (args) => (
    <ShellStory path="/agents" role="operator" defaultAssistantHidden>
      <AgentsRoute {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof AgentsRoute>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByRole("link", {
        name: /billing-reconcile/,
      }),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = {
  parameters: { graphql: { mocks: agentsMocks.loading } },
};

export const Empty: Story = {
  parameters: { graphql: { mocks: agentsMocks.empty } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("No agents yet"),
    ).toBeInTheDocument();
  },
};

export const LoadFailed: Story = {
  parameters: { graphql: { mocks: agentsMocks.error } },
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText(/went wrong/),
    ).toBeInTheDocument();
  },
};

export const Viewer: Story = {
  args: { capabilities: capabilitiesOf("viewer") },
  render: (args) => (
    <ShellStory path="/agents" role="viewer" defaultAssistantHidden>
      <AgentsRoute {...args} />
    </ShellStory>
  ),
};

export const LongData: Story = {
  parameters: { graphql: { mocks: [mockQuery(GET_ENDPOINTS, longEndpoints)] } },
};

/** Thirty agents page through 25 at a time. */
export const Paged: Story = {
  parameters: { graphql: { mocks: [mockQuery(GET_ENDPOINTS, manyEndpoints)] } },
};

/** Suspend runs SuspendAgentEndpoint; a payload with `success: false` shows its error instead of a success. */
export const SuspendRefused: Story = {
  parameters: {
    graphql: {
      mocks: [
        ...agentsMocks.full,
        ...groupsMocks.full,
        agentMutationMocks.suspendRefused,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /Actions for agent support-bot/,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Suspend" }),
    );
    await expect(await canvas.findByRole("alert")).toHaveTextContent(
      "suspended from Astrolift AI",
    );
  },
};

/** Register runs CreateAgentEndpoint and reveals the key it returns. */
export const Register: Story = {
  parameters: {
    graphql: {
      mocks: [
        ...agentsMocks.full,
        ...groupsMocks.full,
        agentMutationMocks.registered,
      ],
    },
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      await within(canvasElement).findByRole("button", {
        name: "Register agent",
      }),
    );
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "research-bot",
    );
    await userEvent.type(
      screen.getByRole("textbox", { name: /Agent id/ }),
      "research-bot",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Type/ }),
      "langgraph",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Register agent" }),
    );
    await expect(
      await screen.findByText("znt_live_91ab4c2e7d0f6a3b8e5c1d9f2a7b4e6c"),
    ).toBeInTheDocument();
  },
};

/** Assign opens the dialog, which only then asks for the groups (GetAgentGroups). */
export const AssignGroup: Story = {
  parameters: {
    graphql: { mocks: [...agentsMocks.full, ...groupsMocks.full] },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", {
        name: /Actions for agent nightly-sync/,
      }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Assign to a group" }),
    );
    await expect(
      await screen.findByRole("option", { name: "Finance" }),
    ).toBeInTheDocument();
  },
};

export const Narrow: Story = {
  ...narrow,
  render: (args) => (
    <ShellStory path="/agents" role="operator" defaultAssistantHidden>
      <AgentsRoute {...args} />
    </ShellStory>
  ),
};
