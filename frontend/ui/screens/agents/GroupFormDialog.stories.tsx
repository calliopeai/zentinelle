import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor } from "storybook/test";

import { GroupFormDialog, type GroupFormDialogProps } from "./GroupFormDialog";

/** Create or edit a group: CreateAgentGroup or UpdateAgentGroup. */
const meta = {
  title: "Screens/Agents/Group form dialog",
  component: GroupFormDialog,
  args: { open: true, onOpenChange: fn(), onSubmit: fn(async () => {}) },
} satisfies Meta<typeof GroupFormDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Create: Story = {
  play: async ({ args }) => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "Research",
    );
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: /Tier/ }),
      "restricted",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));
    await waitFor(() =>
      expect(args.onSubmit).toHaveBeenCalledWith({
        name: "Research",
        description: "",
        tier: "restricted",
        color: "brand",
      }),
    );
  },
};

export const Invalid: Story = {
  play: async ({ args }) => {
    await userEvent.click(
      await screen.findByRole("button", { name: "Create group" }),
    );
    await expect(screen.getByText(/at least 2 characters/)).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** The server answered `errors`: they show, and the dialog stays open. */
export const Refused: Story = {
  args: {
    onSubmit: fn<GroupFormDialogProps["onSubmit"]>(async () => {
      throw new Error("A group with this name already exists.");
    }),
  },
  play: async () => {
    await userEvent.type(
      await screen.findByRole("textbox", { name: /Name/ }),
      "Finance",
    );
    await userEvent.click(screen.getByRole("button", { name: "Create group" }));
    await expect(await screen.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  },
};

export const Edit: Story = {
  args: {
    initial: {
      name: "Finance",
      description:
        "Reconciliation and billing agents with regulated data access.",
      tier: "restricted",
      color: "amber",
    },
  },
};

export const EditLongName: Story = {
  args: {
    initial: {
      name: "Customer support, EMEA enterprise accounts under the regulated data tier",
      description: "x ".repeat(200),
      tier: "standard",
      color: "rose",
    },
  },
};
