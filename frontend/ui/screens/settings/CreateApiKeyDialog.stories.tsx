import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { CreateApiKeyDialog } from "./CreateApiKeyDialog";

const meta = {
  title: "Settings/Parts/Create API key dialog",
  component: CreateApiKeyDialog,
  args: { open: true, onOpenChange: fn(), onCreate: fn(async () => {}) },
} satisfies Meta<typeof CreateApiKeyDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const Creates: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("Name"), "ci-policy-sync");
    await userEvent.click(body.getByRole("checkbox", { name: "Write" }));
    await userEvent.click(body.getByRole("button", { name: "Create key" }));
    await expect(args.onCreate).toHaveBeenCalledWith({
      name: "ci-policy-sync",
      scopes: ["read", "write"],
    });
  },
};

export const NeedsANameAndAScope: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("checkbox", { name: "Read" }));
    await userEvent.click(body.getByRole("button", { name: "Create key" }));
    await expect(
      body.getByText("Name the key after what uses it."),
    ).toBeInTheDocument();
    await expect(
      body.getByText("Pick at least one scope."),
    ).toBeInTheDocument();
    await expect(args.onCreate).not.toHaveBeenCalled();
  },
};

export const ServerRefuses: Story = {
  args: {
    onCreate: fn(async () => {
      throw new Error("A key with this name already exists.");
    }),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("Name"), "grafana-usage");
    await userEvent.click(body.getByRole("button", { name: "Create key" }));
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "already exists",
    );
  },
};
