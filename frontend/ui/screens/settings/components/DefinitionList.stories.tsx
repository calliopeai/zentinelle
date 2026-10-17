import type { Meta, StoryObj } from "@storybook/react-vite";

import { DefinitionList } from "./DefinitionList";

const meta = {
  title: "Settings/Components/Definition list",
  component: DefinitionList,
  parameters: { layout: "padded" },
  args: {
    items: [
      { term: "Slug", value: "acme-robotics", mono: true },
      { term: "Plan", value: "Enterprise" },
      { term: "Deployment", value: "Self-hosted" },
      { term: "Created", value: "2 Sept 2026" },
    ],
  },
} satisfies Meta<typeof DefinitionList>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Facts: Story = {};

export const LongValues: Story = {
  args: {
    items: [
      {
        term: "Base URL",
        value:
          "https://astrolift.internal.acme-robotics-holdings-international.example/api/v1/zentinelle/enrollment",
        mono: true,
      },
      {
        term: "Tenants",
        value: "t-7f3c, t-1d9e, t-55b2, t-c041, t-9a10, t-2b77",
      },
      { term: "Last call", value: null },
    ],
  },
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
};
