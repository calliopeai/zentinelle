import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Timeline } from "./Timeline";

const meta = {
  title: "Shared/Timeline",
  component: Timeline,
  args: {
    label: "Incident timeline",
    entries: [
      { id: "1", at: "2026-10-16T13:58:00Z", title: "Occurred", tone: "error" },
      {
        id: "2",
        at: "2026-10-16T14:01:00Z",
        title: "Detected",
        actor: "Zentinelle AI",
        tone: "warn",
      },
      {
        id: "3",
        at: "2026-10-16T14:05:10Z",
        title: "Acknowledged",
        actor: "Leo Mata",
        tone: "info",
      },
      {
        id: "4",
        at: "2026-10-16T14:20:00Z",
        title: "Comment",
        actor: "Leo Mata",
        body: "Rotated the support-bot key; watching for repeats.",
      },
    ],
  },
} satisfies Meta<typeof Timeline>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Entries: Story = {
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", {
      name: "Incident timeline",
    });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(4);
  },
};

export const Empty: Story = { args: { entries: [] } };

export const LongBody: Story = {
  args: {
    entries: [
      {
        id: "1",
        at: "2026-10-16T14:20:00Z",
        title: "Comment",
        actor: "a-very-long-service-account-name@automation.calliope.ai",
        body: "Line one of a long note.\nLine two: the retrieval tool returned a record from another tenant because the index was shared across two deployments, and the tenant filter ran after ranking.",
      },
    ],
  },
};
