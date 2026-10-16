import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { STORY_LOCALES } from "../storybook/session";
import { LanguageDialog } from "./LanguageDialog";

const meta = {
  title: "Shell/Language dialog",
  component: LanguageDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    locale: "en",
    locales: STORY_LOCALES,
    onLocaleChange: fn(),
  },
} satisfies Meta<typeof LanguageDialog>;
export default meta;

type Story = StoryObj<typeof meta>;

export const Open: Story = {};

export const ChoosesALanguage: Story = {
  render: function Render(args) {
    const [open, setOpen] = React.useState(true);
    return (
      <LanguageDialog
        {...args}
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          args.onOpenChange(next);
        }}
      />
    );
  },
  play: async ({ args, canvasElement }) => {
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(body.getByRole("radio", { name: "German" }));
    await userEvent.click(body.getByRole("button", { name: "Apply" }));
    await expect(args.onLocaleChange).toHaveBeenCalledWith("de");
  },
};

export const Translated: Story = {
  args: {
    locale: "de",
    title: "Sprache",
    description: "Wählen Sie die Sprache der Oberfläche.",
    applyLabel: "Übernehmen",
    cancelLabel: "Abbrechen",
  },
};
