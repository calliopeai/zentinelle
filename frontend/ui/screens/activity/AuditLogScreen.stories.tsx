import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";

import type { Role } from "../../product";
import {
  auditLogs,
  auditLogsMocks,
  longAuditLogs,
} from "../../storybook/fixtures/activity";
import { NARROW } from "../../storybook/narrow";
import { ShellStory } from "../../storybook/ShellStory";
import { AuditLogScreen, type AuditLogScreenProps } from "./AuditLogScreen";
import { useAuditLogData } from "./data";

const meta = {
  title: "Activity/AuditLog",
  component: AuditLogScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof AuditLogScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

const VERIFIED = {
  verifying: false,
  result: {
    valid: true,
    records_checked: 48211,
    broken_at_sequence: null,
    root_hash: "9f2c4e1ab37d0c5e8f6a2b1d4c7e9a0b",
  },
};

function props(
  overrides: Partial<AuditLogScreenProps> = {},
): AuditLogScreenProps {
  return {
    auditLogs: { rows: auditLogs },
    search: "",
    onSearchChange: fn(),
    range: { from: "", to: "" },
    onRangeChange: fn(),
    apiBase: "/api/zentinelle/v1",
    today: "2026-10-16",
    verify: VERIFIED,
    onVerify: fn(),
    ...overrides,
  };
}

function screenStory(
  overrides: Partial<AuditLogScreenProps> = {},
  role: Role = "admin",
): Story {
  return {
    args: props(overrides),
    render: (args) => (
      <ShellStory path="/audit-logs" role={role} defaultAssistantHidden>
        <AuditLogScreen {...args} />
      </ShellStory>
    ),
  };
}

export const Full: Story = screenStory();

/** The export menu offers the backend's four formats, carrying the date range (audit M2). */
export const ExportMenu: Story = {
  ...screenStory({ range: { from: "2026-10-01", to: "2026-10-16" } }),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Export" }),
    );
    const cef = await screen.findByRole("menuitem", { name: /CEF/ });
    await expect(cef).toHaveAttribute(
      "href",
      "/api/zentinelle/v1/audit/export/?format=cef&from=2026-10-01&to=2026-10-16",
    );
    await screen.findByText(/from 2026-10-01 to 2026-10-16/);
  },
};

export const VerifyChain: Story = {
  ...screenStory(),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Verify chain" }),
    );
    await expect(args.onVerify).toHaveBeenCalled();
    await screen.findByText("intact");
  },
};

export const OpenEntry: Story = {
  ...screenStory(),
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: /^policy\.update at/ }),
    );
    await screen.findByRole("table");
  },
};

export const Loading: Story = screenStory({
  auditLogs: { rows: [], loading: true },
});

export const Empty: Story = screenStory({ auditLogs: { rows: [] } });

export const EmptyFiltered: Story = screenStory({
  auditLogs: { rows: [] },
  search: "rotate",
});

export const EmptyFilteredByDate: Story = screenStory({
  auditLogs: { rows: [] },
  range: { from: "2026-01-01", to: "2026-01-02" },
});

export const Error: Story = screenStory({
  auditLogs: {
    rows: [],
    error: { message: "Something went wrong on the server." },
    onRetry: fn(),
  },
});

/** Viewers read the audit log, export it and verify it; nothing here changes data. */
export const Viewer: Story = screenStory({}, "viewer");

export const LongData: Story = screenStory({
  auditLogs: { rows: longAuditLogs },
});

export const Narrow: Story = { ...screenStory(), ...NARROW };

function Connected() {
  return (
    <AuditLogScreen
      {...useAuditLogData()}
      apiBase="/api/zentinelle/v1"
      today="2026-10-16"
      verify={VERIFIED}
      onVerify={() => {}}
    />
  );
}

/** Wired: `GetAuditLogs`. */
export const ConnectedFull: Story = {
  args: props(),
  parameters: { graphql: { mocks: auditLogsMocks.full } },
  render: () => (
    <ShellStory path="/audit-logs" role="admin" defaultAssistantHidden>
      <Connected />
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText("api_key.create");
  },
};

export const ConnectedError: Story = {
  ...ConnectedFull,
  parameters: { graphql: { mocks: auditLogsMocks.error } },
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByText(/went wrong/);
  },
};
