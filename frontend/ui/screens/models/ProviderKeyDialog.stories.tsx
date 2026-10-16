import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { ProviderKeyDialog } from "./ProviderKeyDialog";

const meta = {
  title: "Screens/Models & usage/Provider key dialog",
  component: ProviderKeyDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    providerLabel: "Anthropic",
    rotating: false,
    onSave: fn(),
  },
} satisfies Meta<typeof ProviderKeyDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Add: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("API key"), "sk-ant-test-1234");
    await userEvent.click(body.getByRole("button", { name: "Save key" }));
    await expect(args.onSave).toHaveBeenCalledWith("sk-ant-test-1234");
    await waitFor(() => expect(args.onOpenChange).toHaveBeenCalledWith(false));
  },
};

export const Rotate: Story = { args: { rotating: true } };

export const SaveFails: Story = {
  args: {
    onSave: fn(async () => {
      throw new Error("The provider rejected this key.");
    }),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("API key"), "sk-bad");
    await userEvent.click(body.getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(body.getByRole("alert")).toHaveTextContent(
        "The provider rejected this key.",
      ),
    );
  },
};

export const LongName: Story = {
  args: {
    providerLabel:
      "Amazon Bedrock (us-east-1, us-east-2, us-west-2) for the regulated tier",
  },
};
