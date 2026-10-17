import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import { ReportIncidentDialog } from "./ReportIncidentDialog";

const meta = {
  title: "Activity/ReportIncidentDialog",
  component: ReportIncidentDialog,
  args: { open: true, onOpenChange: fn(), onSubmit: fn() },
} satisfies Meta<typeof ReportIncidentDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Blank: Story = {};

/** Sends `CreateIncidentInput` with the trimmed fields. */
export const Submits: Story = {
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByLabelText("Title"),
      "  Leaked key in a tool call ",
    );
    await userEvent.type(
      screen.getByLabelText("What happened"),
      "A tool echoed an API key.",
    );
    await userEvent.selectOptions(screen.getByLabelText("Severity"), "high");
    await userEvent.click(
      screen.getByRole("button", { name: "Report incident" }),
    );
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        title: "Leaked key in a tool call",
        description: "A tool echoed an API key.",
        severity: "high",
        incidentType: "other",
      }),
    );
  },
};

export const Required: Story = {
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Report incident" }),
    );
    await screen.findByRole("alert");
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** The server refused: the dialog stays open with the message. */
export const ServerError: Story = {
  args: {
    onSubmit: fn(async () => {
      throw new Error("You need the operator role to report incidents.");
    }),
  },
  play: async () => {
    await userEvent.type(await screen.findByLabelText("Title"), "x");
    await userEvent.type(screen.getByLabelText("What happened"), "y");
    await userEvent.click(
      screen.getByRole("button", { name: "Report incident" }),
    );
    await screen.findByText("You need the operator role to report incidents.");
  },
};
