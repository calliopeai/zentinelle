import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { GenerateReportDialog } from "./GenerateReportDialog";

const FRAMEWORKS = [
  { value: "HIPAA", label: "HIPAA" },
  { value: "SOC2", label: "SOC 2 Type II" },
  { value: "EU_AI_ACT", label: "EU AI Act" },
];

const meta = {
  title: "Risk & compliance/Components/GenerateReportDialog",
  component: GenerateReportDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    frameworks: FRAMEWORKS,
    today: "2026-10-16",
    onSubmit: fn(async (): Promise<string | void> => undefined),
  },
} satisfies Meta<typeof GenerateReportDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Compliance: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Framework"),
      "SOC2",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Generate" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith({
      kind: "compliance",
      frameworkId: "SOC2",
      startDate: "2026-09-16",
      endDate: "2026-10-16",
    });
  },
};

export const ExportJob: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Report"),
      "audit_trail",
    );
    await userEvent.selectOptions(
      within(dialog).getByLabelText("Format"),
      "ndjson",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Generate" }),
    );
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "audit_trail", format: "ndjson" }),
    );
  },
};

export const ServerError: Story = {
  args: {
    onSubmit: fn(
      async () => "Temporal is not reachable; the job was not queued.",
    ),
  },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Generate" }),
    );
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Temporal is not reachable",
    );
  },
};
