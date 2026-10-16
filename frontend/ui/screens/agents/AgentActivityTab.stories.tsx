import type { Meta, StoryObj } from "@storybook/react-vite";

import type { EventData } from "@/graphql/events/types";

import { events, longEvents } from "../../storybook/fixtures/agents";
import { fixtureController } from "../../storybook/table";
import { AgentActivityTab } from "./AgentActivityTab";

/** Activity: GetEvents for one agent. */
const meta = {
  title: "Screens/Agents/Tabs/Activity",
  component: AgentActivityTab,
  args: { table: fixtureController<EventData>({ rows: events.events }) },
} satisfies Meta<typeof AgentActivityTab>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Loading: Story = {
  args: {
    table: fixtureController<EventData>({ state: "loading", totalCount: null }),
  },
};
export const Empty: Story = { args: { table: fixtureController<EventData>() } };
export const LoadFailed: Story = {
  args: {
    table: fixtureController<EventData>({
      state: "error",
      error: { message: "Something went wrong on the server." },
    }),
  },
};
/** A poll in flight: the old rows hold, under a progress line. */
export const Refreshing: Story = {
  args: {
    table: fixtureController<EventData>({ rows: events.events, isStale: true }),
  },
};
export const LongData: Story = {
  args: { table: fixtureController<EventData>({ rows: longEvents.events }) },
};
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-192">
        <Story />
      </div>
    ),
  ],
};
