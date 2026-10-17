import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";

import type { Role } from "../../product";
import {
  incidentComments,
  incidents,
  longIncidents,
} from "../../storybook/fixtures/activity";
import { NARROW } from "../../storybook/narrow";
import { ShellStory } from "../../storybook/ShellStory";
import {
  IncidentDetailScreen,
  type IncidentDetailScreenProps,
  type IncidentTab,
} from "./IncidentDetailScreen";

const meta = {
  title: "Activity/IncidentDetail",
  component: IncidentDetailScreen,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof IncidentDetailScreen>;
export default meta;

type Story = StoryObj<typeof meta>;

const AUTHORS: Record<string, string> = { "7": "Leo Mata", "12": "Dana Ruiz" };

function props(
  overrides: Partial<IncidentDetailScreenProps> = {},
): IncidentDetailScreenProps {
  return {
    tab: "timeline",
    incident: incidents[0],
    comments: { rows: incidentComments },
    authorName: (id) => AUTHORS[id] ?? `User ${id}`,
    evidenceHref: "/api/zentinelle/v1/incidents/inc-1/evidence/",
    canMutate: true,
    onAcknowledge: fn(),
    onResolve: fn(),
    onClose: fn(),
    onComment: fn(),
    ...overrides,
  };
}

const TAB_PATH: Record<IncidentTab, string> = {
  timeline: "",
  evidence: "/evidence",
  comments: "/comments",
};

function screenStory(
  overrides: Partial<IncidentDetailScreenProps> = {},
  role: Role = "operator",
): Story {
  return {
    args: props(overrides),
    render: (args) => (
      <ShellStory
        path={`/incidents/${args.incident?.id ?? "missing"}${TAB_PATH[args.tab]}`}
        role={role}
        defaultAssistantHidden
      >
        <IncidentDetailScreen {...args} />
      </ShellStory>
    ),
  };
}

/** Moments and comments on one rule, oldest first. */
export const Timeline: Story = {
  ...screenStory(),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "Incident timeline" });
    const items = within(list).getAllByRole("listitem");
    await expect(items[0]).toHaveTextContent("Occurred");
    await expect(items[items.length - 1]).toHaveTextContent("Dana Ruiz");
    await expect(
      canvas.getByRole("link", { name: "Comments (2)" }),
    ).toHaveAttribute("href", "/incidents/inc-1/comments");
  },
};

export const Evidence: Story = {
  ...screenStory({
    tab: "evidence",
    incident: incidents[2],
    evidenceHref: "/api/zentinelle/v1/incidents/inc-3/evidence/",
  }),
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: "Download bundle" }),
    ).toHaveAttribute("href", "/api/zentinelle/v1/incidents/inc-3/evidence/");
  },
};

export const Comments: Story = {
  ...screenStory({ tab: "comments" }),
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(
      canvas.getByLabelText("Add a comment"),
      "Customer notified.",
    );
    await userEvent.click(canvas.getByRole("button", { name: "Post comment" }));
    await waitFor(() =>
      expect(args.onComment).toHaveBeenCalledWith("Customer notified."),
    );
  },
};

export const CommentsEmpty: Story = screenStory({
  tab: "comments",
  comments: { rows: [] },
});

export const CommentsLoading: Story = screenStory({
  tab: "comments",
  comments: { rows: [], loading: true },
});

export const CommentsError: Story = screenStory({
  tab: "comments",
  comments: {
    rows: [],
    error: { message: "Request failed (502)" },
    onRetry: fn(),
  },
});

/** Not yet acknowledged: Acknowledge is the primary action. */
export const New: Story = {
  ...screenStory({ incident: incidents[1], comments: { rows: [] } }),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Acknowledge" }),
    );
    await expect(args.onAcknowledge).toHaveBeenCalled();
  },
};

/** Acknowledged: Resolve asks for the resolution. */
export const Resolve: Story = {
  ...screenStory(),
  play: async ({ args, canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Resolve" }),
    );
    await userEvent.type(
      await screen.findByLabelText("Resolution"),
      "Filter moved before ranking",
    );
    await userEvent.click(screen.getByRole("button", { name: "Resolve" }));
    await waitFor(() =>
      expect(args.onResolve).toHaveBeenCalledWith(
        "Filter moved before ranking",
      ),
    );
  },
};

/** Resolved: Close is left. */
export const Resolved: Story = {
  ...screenStory({ incident: incidents[2], comments: { rows: [] } }),
  play: async ({ canvasElement }) => {
    await within(canvasElement).findByRole("button", { name: "Close" });
  },
};

/** A viewer reads the incident and its comments; no actions, no comment box. */
export const Viewer: Story = {
  ...screenStory({ tab: "comments", canMutate: false }, "viewer"),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByLabelText("Add a comment")).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Resolve" })).toBeNull();
  },
};

export const Loading: Story = screenStory({ incident: null, loading: true });

export const Error: Story = screenStory({
  incident: null,
  error: { message: "Something went wrong on the server." },
  onRetry: fn(),
});

export const NotFound: Story = screenStory({ incident: null });

export const LongData: Story = screenStory({
  incident: longIncidents[0],
  tab: "evidence",
});

export const Narrow: Story = { ...screenStory(), ...NARROW };
