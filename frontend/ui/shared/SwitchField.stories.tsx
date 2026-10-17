import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { SwitchField } from "./SwitchField";

const meta = {
  title: "Shared/Switch field",
  component: SwitchField,
  parameters: { layout: "padded" },
  args: {
    label: "Audit logging",
    description: "Record every policy decision for compliance review.",
    checked: true,
    onCheckedChange: fn(),
  },
} satisfies Meta<typeof SwitchField>;
export default meta;

type Story = StoryObj<typeof meta>;

export const On: Story = {};

export const Off: Story = { args: { checked: false } };

export const Disabled: Story = { args: { disabled: true } };

export const Toggles: Story = {
  render: function Render(args) {
    const [checked, setChecked] = React.useState(false);
    return (
      <SwitchField
        {...args}
        checked={checked}
        onCheckedChange={(next) => {
          setChecked(next);
          args.onCheckedChange(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const toggle = within(canvasElement).getByRole("switch", {
      name: "Audit logging",
    });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await expect(args.onCheckedChange).toHaveBeenCalledWith(true);
  },
};

export const LongCopy: Story = {
  args: {
    label:
      "Require exact human approval for suspend, revoke and tool containment",
    description:
      "Every containment action waits for a person to approve the exact action, target and reason, even when an automated policy proposed it. This adds a step to every incident response.",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
};
