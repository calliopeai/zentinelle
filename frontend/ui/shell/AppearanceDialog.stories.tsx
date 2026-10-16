import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";

import { AppearanceDialog } from "./AppearanceDialog";

const meta = {
  title: "Shell/Appearance dialog",
  component: AppearanceDialog,
  args: { open: true, onOpenChange: fn() },
} satisfies Meta<typeof AppearanceDialog>;
export default meta;

export const Open: StoryObj<typeof meta> = {};
