import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { BootstrapTokens } from "./BootstrapTokens";

const meta = {
  title: "Settings/Parts/Bootstrap tokens",
  component: BootstrapTokens,
  parameters: { layout: "padded" },
  args: { tenantId: "org-7f3c2a91" },
} satisfies Meta<typeof BootstrapTokens>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Command: Story = {
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByText(/bootstrap_token generate org-7f3c2a91/),
    ).toBeInTheDocument();
  },
};

export const LongTenant: Story = {
  args: {
    tenantId:
      "org-acme-robotics-holdings-international-applied-autonomy-research-7f3c2a91",
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 480 }}>
        <Story />
      </div>
    ),
  ],
};
