import type { Meta, StoryObj } from "@storybook/react-vite";

import { AccessState } from "./AccessState";

const meta = {
  title: "Patterns/AccessState",
  component: AccessState,
  args: { subject: "Evidence" },
} satisfies Meta<typeof AccessState>;
export default meta;
type Story = StoryObj<typeof meta>;

export const AdminOnly: Story = {};

export const OperatorOnly: Story = {
  args: {
    subject: "Changing risks",
    role: "operator",
    homeHref: "/risks",
    homeLabel: "Back to the register",
  },
};
