import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, within } from "storybook/test";

import { enrollmentCode } from "../../storybook/fixtures/settings";
import { EnrollmentCodeDialog } from "./EnrollmentCodeDialog";

const meta = {
  title: "Settings/Parts/Enrollment code dialog",
  component: EnrollmentCodeDialog,
  args: {
    code: enrollmentCode,
    zentinelleUrl: "https://zentinelle.acme.example",
    onClose: fn(),
  },
} satisfies Meta<typeof EnrollmentCodeDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {
  play: async ({ canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await expect(body.getByText(enrollmentCode.code)).toBeInTheDocument();
    await expect(
      body.getByRole("button", { name: "Copy Zentinelle AI URL" }),
    ).toBeInTheDocument();
  },
};

export const LongUrl: Story = {
  args: {
    zentinelleUrl:
      "https://zentinelle.internal.acme-robotics-holdings-international.example/governance/production",
  },
};

export const Closed: Story = {
  args: { code: null },
  decorators: [
    (Story) => (
      <div>
        <p>No code: the dialog is closed.</p>
        <Story />
      </div>
    ),
  ],
};
