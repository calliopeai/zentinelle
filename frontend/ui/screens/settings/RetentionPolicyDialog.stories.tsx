import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { retentionPolicies } from "../../storybook/fixtures/settings";
import { RetentionPolicyDialog } from "./RetentionPolicyDialog";

const meta = {
  title: "Settings/Parts/Retention policy dialog",
  component: RetentionPolicyDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    policy: null,
    onSave: fn(async () => {}),
  },
} satisfies Meta<typeof RetentionPolicyDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const New: Story = {};

export const Edit: Story = { args: { policy: retentionPolicies[1] } };

export const Creates: Story = {
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.type(body.getByLabelText("Name"), "Sessions, 30 days");
    await userEvent.selectOptions(body.getByLabelText("Data"), "sessions");
    const days = body.getByLabelText("Keep for (days)");
    await userEvent.clear(days);
    await userEvent.type(days, "30");
    await userEvent.click(body.getByRole("button", { name: "Create policy" }));
    await expect(args.onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Sessions, 30 days",
        entityType: "sessions",
        retentionDays: 30,
      }),
    );
  },
};

export const MinimumAboveRetention: Story = {
  args: { policy: { ...retentionPolicies[0], minimumRetentionDays: 120 } },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(
      body.getByText("The minimum cannot exceed the retention period."),
    ).toBeInTheDocument();
  },
};

export const ServerRefuses: Story = {
  args: {
    policy: retentionPolicies[1],
    onSave: fn(async () => {
      throw new Error("SOX requires at least 2555 days.");
    }),
  },
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("button", { name: "Save policy" }));
    await expect(await body.findByRole("alert")).toHaveTextContent("2555 days");
  },
};
