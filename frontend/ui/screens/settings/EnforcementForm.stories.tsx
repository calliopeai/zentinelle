import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  bareOrganization,
  organization,
} from "../../storybook/fixtures/settings";
import { EnforcementForm } from "./EnforcementForm";

const meta = {
  title: "Settings/Parts/Enforcement form",
  component: EnforcementForm,
  parameters: { layout: "padded" },
  args: {
    organization: organization.myOrganization!,
    onSave: fn(async () => {}),
  },
} satisfies Meta<typeof EnforcementForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Configured: Story = {};

export const Defaults: Story = {
  args: { organization: bareOrganization.myOrganization! },
};

export const ChangesMode: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.selectOptions(
      canvas.getByLabelText("Default enforcement mode"),
      "block",
    );
    await userEvent.click(
      canvas.getByRole("switch", { name: "Audit logging" }),
    );
    await userEvent.click(
      canvas.getByRole("button", { name: "Save enforcement" }),
    );
    await expect(args.onSave).toHaveBeenCalledWith({
      defaultPolicyMode: "block",
      auditLogging: false,
    });
  },
};
