import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, within } from "storybook/test";

import { ExportMenu } from "./ExportMenu";

const meta = {
  title: "Shared/ExportMenu",
  component: ExportMenu,
  args: {
    formats: [
      {
        key: "csv",
        label: "CSV",
        description: "One row per record, for a spreadsheet",
        href: "/export?format=csv",
      },
      {
        key: "ndjson",
        label: "NDJSON",
        description: "One JSON record per line",
        href: "/export?format=ndjson",
      },
    ],
    scope: "Every record from Oct 1 to Oct 16, 2026.",
  },
} satisfies Meta<typeof ExportMenu>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

export const Open: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole("button", { name: "Export" }),
    );
    const csv = await screen.findByRole("menuitem", { name: /CSV/ });
    await expect(csv).toHaveAttribute("href", "/export?format=csv");
  },
};

export const Disabled: Story = { args: { disabled: true } };
