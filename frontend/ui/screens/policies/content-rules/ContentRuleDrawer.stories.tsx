import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  contentRules,
  longRule,
} from "../../../storybook/fixtures/content-rules";
import { NARROW } from "../story-helpers";
import { ContentRuleDrawer } from "./ContentRuleDrawer";

const meta = {
  title: "Policies/Panels/Content rule",
  component: ContentRuleDrawer,
  args: {
    open: true,
    onOpenChange: fn(),
    rule: contentRules[0],
    canEdit: true,
    onSubmit: fn(async () => true),
  },
} satisfies Meta<typeof ContentRuleDrawer>;
export default meta;
type S = StoryObj<typeof meta>;

export const Edit: S = {};
export const New: S = { args: { rule: null } };
export const NewValidation: S = {
  args: { rule: null },
  play: async ({ args }) => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Create rule" }),
    );
    await expect(body.getByText("A name is required.")).toBeInTheDocument();
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};
export const ServerRefuses: S = {
  args: {
    onSubmit: fn(async () => {
      throw new globalThis.Error(
        "The pattern is not a valid regular expression.",
      );
    }),
  },
  play: async () => {
    const body = within(document.body);
    await userEvent.click(
      await body.findByRole("button", { name: "Save rule" }),
    );
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "not a valid regular expression",
    );
  },
};
export const Viewer: S = { args: { canEdit: false } };
export const LongData: S = { args: { rule: longRule } };
export const Narrow: S = { ...NARROW };
