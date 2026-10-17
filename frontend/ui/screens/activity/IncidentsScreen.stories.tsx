import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";

import type { Role } from "../../product";
import {
  incidents,
  incidentsMocks,
  longIncidents,
} from "../../storybook/fixtures/activity";
import { NARROW } from "../../storybook/narrow";
import { ShellStory } from "../../storybook/ShellStory";
import { useIncidentsData } from "./data";
import {
  IncidentsScreen,
  NO_INCIDENT_FILTERS,
  type IncidentsScreenProps,
} from "./IncidentsScreen";

const meta = {
  title: "Activity/Incidents",
  component: IncidentsScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof IncidentsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

function props(
  overrides: Partial<IncidentsScreenProps> = {},
): IncidentsScreenProps {
  return {
    incidents: { rows: incidents },
    filters: NO_INCIDENT_FILTERS,
    onFiltersChange: fn(),
    search: "",
    onSearchChange: fn(),
    canMutate: true,
    onReport: fn(),
    ...overrides,
  };
}

function screenStory(
  overrides: Partial<IncidentsScreenProps> = {},
  role: Role = "operator",
): Story {
  return {
    args: props(overrides),
    render: (args) => (
      <ShellStory path="/incidents" role={role} defaultAssistantHidden>
        <IncidentsScreen {...args} />
      </ShellStory>
    ),
  };
}

/** Rows are links to the new incident page. */
export const Full: Story = {
  ...screenStory(),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: /^PII in model output/ }),
    ).toHaveAttribute("href", "/incidents/inc-1");
  },
};

export const Loading: Story = screenStory({
  incidents: { rows: [], loading: true },
});

export const Empty: Story = screenStory({ incidents: { rows: [] } });

export const EmptyFiltered: Story = screenStory({
  incidents: { rows: [] },
  search: "nothing like this",
});

export const EmptyFilteredBySelect: Story = screenStory({
  incidents: { rows: [] },
  filters: { ...NO_INCIDENT_FILTERS, severity: "critical" },
});

export const Error: Story = screenStory({
  incidents: {
    rows: [],
    error: { message: "Something went wrong on the server." },
    onRetry: fn(),
  },
});

/** A viewer reads incidents; no Report action. */
export const Viewer: Story = {
  ...screenStory({ canMutate: false }, "viewer"),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Report incident" }),
    ).toBeNull();
  },
};

export const LongData: Story = screenStory({
  incidents: { rows: longIncidents },
});

export const Narrow: Story = { ...screenStory(), ...NARROW };

export const Report: Story = {
  ...screenStory(),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Report incident" }),
    );
    await screen.findByRole("dialog", { name: "Report an incident" });
  },
};

function Connected() {
  return (
    <IncidentsScreen {...useIncidentsData()} canMutate onReport={() => {}} />
  );
}

/** Wired: `GetIncidents`. */
export const ConnectedFull: Story = {
  args: props(),
  parameters: { graphql: { mocks: incidentsMocks.full } },
  render: () => (
    <ShellStory path="/incidents" role="operator" defaultAssistantHidden>
      <Connected />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("Budget overrun on nightly-sync");
  },
};

export const ConnectedEmpty: Story = {
  ...ConnectedFull,
  parameters: { graphql: { mocks: incidentsMocks.empty } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("No incidents");
  },
};

export const ConnectedError: Story = {
  ...ConnectedFull,
  parameters: { graphql: { mocks: incidentsMocks.error } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
