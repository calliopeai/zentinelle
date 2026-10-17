import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { Role } from "../../product";
import {
  alerts,
  alertsMocks,
  longAlerts,
  longNotifications,
  notifications,
  notificationsMocks,
} from "../../storybook/fixtures/activity";
import { NARROW } from "../../storybook/narrow";
import { ShellStory } from "../../storybook/ShellStory";
import {
  AlertsScreen,
  NO_ALERT_FILTERS,
  type AlertsScreenProps,
  type AlertsView,
} from "./AlertsScreen";
import { useAlertsData } from "./data";

const meta = {
  title: "Activity/Alerts",
  component: AlertsScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AlertsScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

const PATH: Record<AlertsView, string> = {
  open: "/alerts",
  all: "/alerts?view=all",
  mine: "/alerts?view=mine",
};

function props(overrides: Partial<AlertsScreenProps> = {}): AlertsScreenProps {
  return {
    view: "open",
    canMutate: true,
    alerts: { rows: alerts.filter((a) => a.status === "open") },
    filters: NO_ALERT_FILTERS,
    onFiltersChange: fn(),
    onAcknowledge: fn(),
    onResolve: fn(),
    onDismiss: fn(),
    notifications: { rows: notifications },
    notificationStatus: "",
    onNotificationStatusChange: fn(),
    unreadCount: 2,
    onMarkRead: fn(),
    onMarkAllRead: fn(),
    ...overrides,
  };
}

function screenStory(
  overrides: Partial<AlertsScreenProps> = {},
  role: Role = "operator",
): Story {
  const p = props(overrides);
  return {
    args: p,
    render: (args) => (
      <ShellStory path={PATH[args.view]} role={role} defaultAssistantHidden>
        <AlertsScreen {...args} />
      </ShellStory>
    ),
  };
}

export const Open: Story = {
  ...screenStory(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Mine (2)" }),
    ).toBeInTheDocument();
    await expect(canvas.getByText("PII in model output")).toBeInTheDocument();
  },
};

export const All: Story = screenStory({
  view: "all",
  alerts: { rows: alerts },
});

/** Mine: the person's notifications, replacing /notifications. Rows link to what they are about. */
export const Mine: Story = {
  ...screenStory({ view: "mine" }),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", {
        name: /^Incident opened: PII in model output/,
      }),
    ).toHaveAttribute("href", "/incidents/inc-1");
    await expect(
      canvas.getByRole("button", { name: "Mark all read" }),
    ).toBeInTheDocument();
  },
};

export const Loading: Story = screenStory({
  alerts: { rows: [], loading: true },
});

export const Empty: Story = screenStory({ alerts: { rows: [] } });

export const EmptyAll: Story = screenStory({
  view: "all",
  alerts: { rows: [] },
});

export const EmptyFiltered: Story = screenStory({
  alerts: { rows: [] },
  filters: { severity: "critical", alertType: "" },
});

export const Error: Story = screenStory({
  alerts: {
    rows: [],
    error: { message: "Something went wrong on the server." },
    onRetry: fn(),
  },
});

export const MineEmpty: Story = screenStory({
  view: "mine",
  notifications: { rows: [] },
  unreadCount: 0,
});

export const MineAllRead: Story = screenStory({
  view: "mine",
  notifications: { rows: [] },
  notificationStatus: "UNREAD",
  unreadCount: 0,
});

export const MineLoading: Story = screenStory({
  view: "mine",
  notifications: { rows: [], loading: true },
  unreadCount: null,
});

export const MineError: Story = screenStory({
  view: "mine",
  notifications: {
    rows: [],
    error: { message: "Something went wrong on the server." },
  },
  unreadCount: null,
});

/** A viewer sees every alert and acts on none; no row menus. */
export const Viewer: Story = {
  ...screenStory(
    { view: "all", alerts: { rows: alerts }, canMutate: false },
    "viewer",
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("PII in model output");
    await expect(
      canvas.queryByRole("button", { name: /Actions for/ }),
    ).toBeNull();
  },
};

export const LongData: Story = screenStory({
  view: "all",
  alerts: { rows: longAlerts },
});

export const MineLongData: Story = screenStory({
  view: "mine",
  notifications: { rows: longNotifications },
  unreadCount: 16,
});

export const Narrow: Story = {
  ...screenStory({ view: "all", alerts: { rows: alerts } }),
  ...NARROW,
};

/** Resolving asks for notes, for the audit log. */
export const ResolveFromRow: Story = {
  ...screenStory({ view: "all", alerts: { rows: alerts } }),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Actions for PII in model output" }),
    );
    await userEvent.click(
      await screen.findByRole("menuitem", { name: "Resolve…" }),
    );
    await userEvent.type(
      await screen.findByLabelText("Resolution notes"),
      "Redaction rule fixed",
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(args.onResolve).toHaveBeenCalledWith(
        alerts[0],
        "Redaction rule fixed",
      ),
    );
  },
};

function Connected({ view }: { view: AlertsView }) {
  const data = useAlertsData(view);
  return <AlertsScreen {...data} canMutate onMarkAllRead={() => {}} />;
}

function connected(view: AlertsView): Story {
  return {
    args: props({ view }),
    parameters: {
      graphql: { mocks: [...alertsMocks.full, ...notificationsMocks.full] },
    },
    render: () => (
      <ShellStory path={PATH[view]} role="operator" defaultAssistantHidden>
        <Connected view={view} />
      </ShellStory>
    ),
  };
}

/** Wired: `ComplianceAlerts` with `status: "open"`, and `UnreadNotifications` for the tab count. */
export const ConnectedOpen: Story = {
  ...connected("open"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText("PII in model output");
    // The acknowledged alert is not open, so the server leaves it out.
    await expect(canvas.queryByText("Jailbreak attempts repeat")).toBeNull();
    await canvas.findByRole("link", { name: "Mine (2)" });
  },
};

/** Wired: `Notifications`, the Mine view. */
export const ConnectedMine: Story = {
  ...connected("mine"),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(
      "nightly-sync is at 82% of its monthly budget",
    );
  },
};

export const ConnectedError: Story = {
  ...connected("open"),
  parameters: {
    graphql: { mocks: [...alertsMocks.error, ...notificationsMocks.full] },
  },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};

export const ConnectedLoading: Story = {
  ...connected("open"),
  parameters: {
    graphql: { mocks: [...alertsMocks.loading, ...notificationsMocks.loading] },
  },
};
