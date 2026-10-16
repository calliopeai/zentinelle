import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import type { ContentRuleData } from "@/graphql/content-rules/types";

import {
  contentRules,
  manyRules,
} from "../../../storybook/fixtures/content-rules";
import { capabilitiesOf } from "../../../storybook/session";
import { ShellStory } from "../../../storybook/ShellStory";
import { NARROW, resolved } from "../story-helpers";
import { ContentRuleDrawer } from "./ContentRuleDrawer";
import {
  ContentRulesScreen,
  type ContentRulesScreenProps,
} from "./ContentRulesScreen";

function Story(
  props: Partial<ContentRulesScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [search, setSearch] = React.useState(rest.search ?? "");
  const [ruleType, setRuleType] = React.useState(rest.ruleType ?? "");
  const [severity, setSeverity] = React.useState(rest.severity ?? "");
  const [open, setOpen] = React.useState<{
    rule: ContentRuleData | null;
  } | null>(null);
  const caps = capabilitiesOf(role);
  return (
    <ShellStory path="/content-rules" role={role} defaultAssistantHidden>
      <ContentRulesScreen
        capabilities={caps}
        rules={contentRules}
        loading={false}
        onRetry={fn()}
        onTest={fn()}
        onToggleEnabled={resolved()}
        onDuplicate={resolved()}
        onDelete={resolved()}
        {...rest}
        onOpenRule={(rule) => setOpen({ rule })}
        search={search}
        onSearchChange={setSearch}
        ruleType={ruleType}
        onRuleTypeChange={setRuleType}
        severity={severity}
        onSeverityChange={setSeverity}
      />
      <ContentRuleDrawer
        open={open !== null}
        onOpenChange={(o) => !o && setOpen(null)}
        rule={open?.rule ?? null}
        canEdit={caps.includes("mutate")}
        onSubmit={resolved()}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Content rules",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Full: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole("button", { name: "Cloud credentials" }),
    );
    await expect(
      await within(document.body).findByRole("button", { name: "Save rule" }),
    ).toBeInTheDocument();
  },
};
export const Loading: S = { render: () => <Story rules={[]} loading /> };
export const Empty: S = { render: () => <Story rules={[]} /> };
export const EmptyFiltered: S = {
  render: () => <Story rules={[]} severity="critical" />,
};
export const Error: S = {
  render: () => (
    <Story
      rules={[]}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};
/** A viewer opens a rule and reads it; there is no New rule and no save. */
export const Viewer: S = {
  render: () => <Story role="viewer" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: /New rule/ })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "Customer PII" }));
    const body = within(document.body);
    await expect(
      await body.findByText(
        "Your role can read content rules but not change them.",
      ),
    ).toBeInTheDocument();
  },
};
export const LongData: S = { render: () => <Story rules={manyRules} /> };
export const Narrow: S = {
  ...NARROW,
  render: () => <Story rules={manyRules} />,
};
