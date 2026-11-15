import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";

import {
  incidentComments,
  incidentsMocks,
} from "../../storybook/fixtures/activity";
import { ShellStory } from "../../storybook/ShellStory";
import {
  IncidentDetailConnected,
  type IncidentCommentsClient,
} from "./IncidentDetailConnected";

const client: IncidentCommentsClient = {
  list: async () => incidentComments,
  post: async (_id, body) => ({
    id: 99,
    author_id: "7",
    body,
    created_at: "2026-10-16T15:00:00Z",
  }),
};

const meta = {
  title: "Activity/Incident (connected)",
  component: IncidentDetailConnected,
  parameters: {
    layout: "fullscreen",
    graphql: { mocks: incidentsMocks.full },
  },
  args: { incidentId: "inc-1", tab: "timeline", canMutate: true, client },
  render: (args) => (
    <ShellStory
      path={`/incidents/${args.incidentId}`}
      role="operator"
      defaultAssistantHidden
    >
      <IncidentDetailConnected {...args} />
    </ShellStory>
  ),
} satisfies Meta<typeof IncidentDetailConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

/** The incident from `GetIncidents`, its REST comments on the timeline. */
export const Timeline: Story = {
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("heading", {
      name: "PII in model output",
    });
  },
};

export const Comments: Story = { args: { tab: "comments" } };

export const Evidence: Story = { args: { tab: "evidence" } };

export const NotFound: Story = {
  args: { incidentId: "inc-missing" },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("This incident does not exist");
  },
};

export const CommentsFailed: Story = {
  args: {
    tab: "comments",
    client: {
      ...client,
      list: async () => {
        throw new globalThis.Error("");
      },
    },
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Could not load comments");
  },
};
