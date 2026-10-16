import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, fn, within } from "storybook/test";

import { manyPrompts, prompts } from "../../../storybook/fixtures/prompts";
import { capabilitiesOf } from "../../../storybook/session";
import { ShellStory } from "../../../storybook/ShellStory";
import { NARROW, resolved } from "../story-helpers";
import {
  PromptLibraryScreen,
  type PromptLibraryScreenProps,
} from "./PromptLibraryScreen";

function Story(
  props: Partial<PromptLibraryScreenProps> & { role?: "viewer" | "operator" },
) {
  const { role = "operator", ...rest } = props;
  const [search, setSearch] = React.useState(rest.search ?? "");
  const [type, setType] = React.useState(rest.type ?? "");
  const [featuredOnly, setFeaturedOnly] = React.useState(
    rest.featuredOnly ?? false,
  );
  return (
    <ShellStory path="/system-prompts" role={role} defaultAssistantHidden>
      <PromptLibraryScreen
        capabilities={capabilitiesOf(role)}
        prompts={prompts}
        loading={false}
        onRetry={fn()}
        onFork={resolved()}
        onDelete={resolved()}
        {...rest}
        search={search}
        onSearchChange={setSearch}
        type={type}
        onTypeChange={setType}
        featuredOnly={featuredOnly}
        onFeaturedOnlyChange={setFeaturedOnly}
      />
    </ShellStory>
  );
}

const meta = {
  title: "Policies/Screens/Prompt library",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type S = StoryObj;

export const Full: S = {
  render: () => <Story />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("link", { name: /^Support agent/ }),
    ).toHaveAttribute("href", "/system-prompts/p-support");
  },
};
export const Loading: S = { render: () => <Story prompts={[]} loading /> };
export const Empty: S = { render: () => <Story prompts={[]} /> };
export const EmptyFiltered: S = {
  render: () => <Story prompts={[]} featuredOnly />,
};
export const Error: S = {
  render: () => (
    <Story
      prompts={[]}
      error={{ message: "Something went wrong on the server." }}
    />
  ),
};
export const Viewer: S = {
  render: () => <Story role="viewer" />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("link", { name: /New prompt/ }),
    ).toBeNull();
  },
};
export const LongData: S = { render: () => <Story prompts={manyPrompts} /> };
export const Narrow: S = {
  ...NARROW,
  render: () => <Story prompts={manyPrompts} />,
};
