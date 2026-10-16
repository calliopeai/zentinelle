import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";

import { GET_EVENTS } from "@/graphql/events/queries";

import type { Role } from "../../product";
import {
  events,
  eventsMocks,
  longEvents,
  newerEvents,
} from "../../storybook/fixtures/activity";
import { mockQuery } from "../../storybook/graphql";
import { NARROW } from "../../storybook/narrow";
import { ShellStory } from "../../storybook/ShellStory";
import { useEventsData } from "./data";
import {
  EventsScreen,
  NO_EVENT_FILTERS,
  type EventsScreenProps,
} from "./EventsScreen";

const meta = {
  title: "Activity/Events",
  component: EventsScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof EventsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

function props(overrides: Partial<EventsScreenProps> = {}): EventsScreenProps {
  return {
    events: { rows: events },
    filters: NO_EVENT_FILTERS,
    onFiltersChange: fn(),
    live: true,
    onLiveChange: fn(),
    heldCount: 0,
    onShowHeld: fn(),
    ...overrides,
  };
}

function screenStory(
  overrides: Partial<EventsScreenProps> = {},
  role: Role = "operator",
): Story {
  return {
    args: props(overrides),
    render: (args) => (
      <ShellStory path="/events" role={role} defaultAssistantHidden>
        <EventsScreen {...args} />
      </ShellStory>
    ),
  };
}

export const Live: Story = screenStory();

/** A poll brought rows in; they wait behind the pill. */
export const HeldRows: Story = {
  ...screenStory({ heldCount: 2 }),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "2 new events" }),
    );
    await expect(args.onShowHeld).toHaveBeenCalled();
  },
};

export const Paused: Story = screenStory({ live: false });

/** A row opens the event and its payload. */
export const OpenEvent: Story = {
  ...screenStory(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: /^Policy violation at/ }),
    );
    await screen.findByLabelText("Payload");
  },
};

export const Loading: Story = screenStory({
  events: { rows: [], loading: true },
});

export const Empty: Story = screenStory({ events: { rows: [] } });

export const EmptyFiltered: Story = screenStory({
  events: { rows: [] },
  filters: { category: "alert", eventType: "" },
});

export const Error: Story = screenStory({
  events: {
    rows: [],
    error: { message: "Something went wrong on the server." },
    onRetry: fn(),
  },
});

/** Events are read-only for every role; a viewer sees the same screen. */
export const Viewer: Story = screenStory({}, "viewer");

export const LongData: Story = screenStory({ events: { rows: longEvents } });

export const Narrow: Story = { ...screenStory(), ...NARROW };

function Connected() {
  return <EventsScreen {...useEventsData()} />;
}

/** Wired: `GetEvents`, polling while live. */
export const ConnectedLive: Story = {
  args: props(),
  parameters: { graphql: { mocks: eventsMocks.full } },
  render: () => (
    <ShellStory path="/events" role="operator" defaultAssistantHidden>
      <Connected />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Config change");
  },
};

/**
 * Wired, with a second answer that holds two newer events: the first poll
 * answer shows whole, the next one waits behind the pill. (The poll runs
 * every 5 seconds; watch it in the catalog.)
 */
export const ConnectedPolling: Story = {
  ...ConnectedLive,
  parameters: {
    graphql: {
      mocks: [
        { ...mockQuery(GET_EVENTS, { events }), maxUsageCount: 1 },
        mockQuery(GET_EVENTS, { events: [...newerEvents, ...events] }),
      ],
    },
  },
};

export const ConnectedError: Story = {
  ...ConnectedLive,
  parameters: { graphql: { mocks: eventsMocks.error } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
