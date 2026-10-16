import type { Meta, StoryObj } from "@storybook/react-vite";

import { AssistantPlaceholder } from "./AssistantPlaceholder";

const meta = {
  title: "Shell/Assistant placeholder",
  component: AssistantPlaceholder,
  decorators: [
    (Story) => (
      <div className="h-96 w-100 border border-border">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof AssistantPlaceholder>;
export default meta;

export const Default: StoryObj<typeof meta> = {};

export const LongCopy: StoryObj<typeof meta> = {
  args: {
    title:
      "The Zentinelle AI assistant docks here once it is enabled for your organization",
    description:
      "An administrator turns the assistant on in Settings, Assistant, and chooses the provider and model it runs on. Until then this dock stays empty, and the shortcut still opens and closes it.",
  },
};
