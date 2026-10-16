import type { Meta, StoryObj } from "@storybook/react-vite";

import type { InteractionLogData } from "@/graphql/interactions/types";

import {
  interactions,
  longInteractions,
} from "../../storybook/fixtures/agents";
import { fixtureController } from "../../storybook/table";
import { AgentInteractionsTab } from "./AgentInteractionsTab";

/** Interactions: GetInteractionLogs for one agent. */
const meta = {
  title: "Screens/Agents/Tabs/Interactions",
  component: AgentInteractionsTab,
  args: {
    table: fixtureController<InteractionLogData>({
      rows: interactions.interactionLogs,
    }),
  },
} satisfies Meta<typeof AgentInteractionsTab>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Full: Story = {};
export const Loading: Story = {
  args: {
    table: fixtureController<InteractionLogData>({
      state: "loading",
      totalCount: null,
    }),
  },
};
export const Empty: Story = {
  args: { table: fixtureController<InteractionLogData>() },
};
export const LoadFailed: Story = {
  args: {
    table: fixtureController<InteractionLogData>({
      state: "error",
      error: { message: "Something went wrong on the server." },
    }),
  },
};
export const LongData: Story = {
  args: {
    table: fixtureController<InteractionLogData>({
      rows: longInteractions.interactionLogs,
    }),
  },
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
