import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { compliancePacks } from "../../../storybook/fixtures/risk";
import { CompliancePacksDialog } from "./CompliancePacksDialog";

const meta = {
  title: "Risk & compliance/Components/CompliancePacksDialog",
  component: CompliancePacksDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    packs: compliancePacks,
    onActivate: fn(async (): Promise<string | void> => undefined),
  },
} satisfies Meta<typeof CompliancePacksDialog>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Packs: Story = {
  play: async ({ args }) => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Apply GDPR essentials" }),
    );
    await expect(args.onActivate).toHaveBeenCalledWith(compliancePacks[1]);
  },
};

export const Loading: Story = { args: { packs: [], loading: true } };

export const Empty: Story = { args: { packs: [] } };

export const LoadError: Story = {
  args: {
    packs: [],
    error: { message: "ListCompliancePacks failed." },
    onRetry: fn(),
  },
};

export const ActivationFails: Story = {
  args: {
    onActivate: fn(
      async () =>
        "The pack's policies conflict with an existing budget_limit policy.",
    ),
  },
  play: async () => {
    const dialog = within(document.body).getByRole("dialog");
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Apply HIPAA baseline" }),
    );
    await expect(
      await within(dialog).findByText(/conflict with an existing/),
    ).toBeInTheDocument();
  },
};
