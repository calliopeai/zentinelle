import type { Meta, StoryObj } from "@storybook/react-vite";
import { within } from "storybook/test";

import { eventsMocks } from "../../storybook/fixtures/activity";
import { ShellStory } from "../../storybook/ShellStory";
import { EventsConnected } from "./EventsConnected";

const meta = {
  title: "Activity/Events (connected)",
  component: EventsConnected,
  parameters: { layout: "fullscreen", graphql: { mocks: eventsMocks.full } },
  render: () => (
    <ShellStory path="/events" role="operator" defaultAssistantHidden>
      <EventsConnected />
    </ShellStory>
  ),
} satisfies Meta<typeof EventsConnected>;
export default meta;

type Story = StoryObj<typeof meta>;

/** `GetEvents`, polled every 5 seconds. */
export const Live: Story = {
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("table");
  },
};

export const Error: Story = {
  parameters: { graphql: { mocks: eventsMocks.error } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
