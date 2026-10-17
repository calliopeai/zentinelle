import { Input } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { Field } from "./Field";

const meta = {
  title: "Shared/Field",
  component: Field,
  args: {
    label: "Name",
    hint: "Shown in lists and in the audit log.",
    children: (control) => (
      <Input defaultValue="Monthly spend cap" {...control} />
    ),
  },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const WithError: Story = {
  args: {
    error: "A name is required.",
    children: (control) => <Input defaultValue="" {...control} />,
  },
};
export const NoHint: Story = { args: { hint: undefined } };
