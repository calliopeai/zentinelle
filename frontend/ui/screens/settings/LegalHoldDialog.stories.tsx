import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { legalHoldOptions } from "../../storybook/fixtures/settings";
import { LegalHoldDialog } from "./LegalHoldDialog";

const meta = {
  title: "Settings/Parts/Legal hold dialog",
  component: LegalHoldDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    holdTypes: legalHoldOptions.legalHoldOptions!.holdTypes,
    onCreate: fn(async () => {}),
  },
} satisfies Meta<typeof LegalHoldDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const Creates: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("Name"), "Doe v. Acme");
    await userEvent.click(body.getByRole("switch", { name: "All data" }));
    await userEvent.click(
      body.getByRole("checkbox", { name: "AI interactions" }),
    );
    await userEvent.click(body.getByRole("button", { name: "Create hold" }));
    await expect(args.onCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Doe v. Acme",
        appliesToAll: false,
        entityTypes: ["interactions"],
      }),
    );
  },
};

export const NarrowScopeNeedsData: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("switch", { name: "All data" }));
    await expect(
      body.getByText("Pick the data the hold covers."),
    ).toBeInTheDocument();
  },
};

export const ServerRefuses: Story = {
  args: {
    onCreate: fn(async () => {
      throw new Error("custodian_email: Enter a valid email address.");
    }),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("Name"), "Audit");
    await userEvent.click(body.getByRole("button", { name: "Create hold" }));
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "valid email",
    );
  },
};
