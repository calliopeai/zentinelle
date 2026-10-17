import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import {
  ruleTestMatch,
  ruleTestNoMatch,
} from "../../../storybook/fixtures/content-rules";
import { TestRuleDialog } from "./TestRuleDialog";

const meta = {
  title: "Policies/Panels/Test a rule",
  component: TestRuleDialog,
  args: {
    open: true,
    onOpenChange: fn(),
    ruleName: "Cloud credentials",
    onTest: fn(async () => ruleTestMatch),
  },
} satisfies Meta<typeof TestRuleDialog>;
export default meta;
type S = StoryObj<typeof meta>;

const typeAndTest = async () => {
  const body = within(document.body);
  await userEvent.type(
    await body.findByRole("textbox", { name: "Sample text" }),
    "my key is AKIAABCDEFGHIJKLMNOP",
  );
  await userEvent.click(body.getByRole("button", { name: "Test" }));
  return body;
};

export const Ready: S = {};
export const Matched: S = {
  play: async () => {
    const body = await typeAndTest();
    await expect(
      await body.findByText("Matched 1 time(s)."),
    ).toBeInTheDocument();
  },
};
export const NoMatch: S = {
  args: { onTest: fn(async () => ruleTestNoMatch) },
  play: async () => {
    const body = await typeAndTest();
    await expect(await body.findByText("No match.")).toBeInTheDocument();
  },
};
export const Fails: S = {
  args: {
    onTest: fn(async () => ({
      success: false,
      matched: null,
      matches: null,
      errors: ["The rule has no pattern."],
    })),
  },
  play: async () => {
    const body = await typeAndTest();
    await expect(await body.findByRole("alert")).toHaveTextContent(
      "no pattern",
    );
  },
};
export const LongName: S = {
  args: {
    ruleName:
      "A custom regular expression for internal ticket identifiers, project code names and customer account numbers",
  },
};
