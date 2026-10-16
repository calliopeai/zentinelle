import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  bareOrganization,
  longOrganization,
  organization,
} from "../../storybook/fixtures/settings";
import { OrganizationForm } from "./OrganizationForm";

const meta = {
  title: "Settings/Parts/Organization form",
  component: OrganizationForm,
  parameters: { layout: "padded" },
  args: {
    organization: organization.myOrganization!,
    onSave: fn(async () => {}),
  },
} satisfies Meta<typeof OrganizationForm>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Filled: Story = {};

export const Fresh: Story = {
  args: { organization: bareOrganization.myOrganization! },
};

export const LongValues: Story = {
  args: { organization: longOrganization.myOrganization! },
};

export const Saves: Story = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const save = canvas.getByRole("button", { name: "Save organization" });
    await expect(save).toBeDisabled();
    await userEvent.clear(canvas.getByLabelText("Name"));
    await userEvent.type(canvas.getByLabelText("Name"), "Acme AI");
    await userEvent.click(save);
    await expect(args.onSave).toHaveBeenCalledWith({
      name: "Acme AI",
      contactEmail: "security@acme.example",
      timezone: "Europe/London",
    });
    await expect(await canvas.findByText("Saved")).toBeInTheDocument();
  },
};

export const SaveFails: Story = {
  args: {
    onSave: fn(async () => {
      throw new Error("Only admins can change organization settings.");
    }),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByLabelText("Time zone"), "x");
    await userEvent.click(
      canvas.getByRole("button", { name: "Save organization" }),
    );
    await expect(
      await canvas.findByText("Only admins can change organization settings."),
    ).toBeInTheDocument();
  },
};

export const NameRequired: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.clear(canvas.getByLabelText("Name"));
    await expect(
      canvas.getByText("The organization needs a name."),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("button", { name: "Save organization" }),
    ).toBeDisabled();
  },
};
