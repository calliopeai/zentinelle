import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";

import { incidentsMocks } from "../../storybook/fixtures/activity";
import { ShellStory } from "../../storybook/ShellStory";
import { IncidentsConnected } from "./IncidentsConnected";

const meta = {
  title: "Activity/Incidents (connected)",
  component: IncidentsConnected,
  parameters: {
    layout: "fullscreen",
    graphql: { mocks: incidentsMocks.full },
  },
  args: { canMutate: true },
  render: (args) => (
    <ShellStory path="/incidents" role="operator" defaultAssistantHidden>
      <IncidentsConnected {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof IncidentsConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

/** `GetIncidents`, with `CreateIncident` behind Report incident. */
export const Full: Story = {
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Budget overrun on nightly-sync");
  },
};

export const Empty: Story = {
  parameters: { graphql: { mocks: incidentsMocks.empty } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No incidents");
  },
};

export const Error: Story = {
  parameters: { graphql: { mocks: incidentsMocks.error } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
