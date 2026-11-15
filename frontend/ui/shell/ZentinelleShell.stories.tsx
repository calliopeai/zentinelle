import { EmptyState, PageFrame } from "@calliopelabs/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";

import { UNBUILT_ROUTES, interimTabs } from "../product";
import { CATALOG_LOCALES } from "../storybook/session";
import { ShellStory } from "../storybook/ShellStory";
import { ZentinelleShell } from "./ZentinelleShell";

/**
 * The console frame: seven areas on the navy sidebar, filtered by role, and
 * the assistant dock on the right. Screens render inside it; see
 * Screens/Shell for every area.
 */
const meta = {
  title: "Shell/Zentinelle shell",
  component: ZentinelleShell,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof ZentinelleShell>;
export default meta;

type Story = StoryObj;

const page = (
  <PageFrame title="Agents">
    <EmptyState title="The Agents screen renders here" />
  </PageFrame>
);

export const Admin: Story = {
  render: () => (
    <ShellStory path="/agents" role="admin">
      {page}
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "General" }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole("complementary", { name: "Assistant" }),
    ).toBeInTheDocument();
    await userEvent.click(
      canvas.getByRole("button", { name: "Assistant", pressed: true }),
    );
    await expect(
      canvas.queryByRole("complementary", { name: "Assistant" }),
    ).not.toBeInTheDocument();
  },
};

/** Operators see what viewers see; what they may change is up to each screen. */
export const Operator: Story = {
  render: () => (
    <ShellStory path="/agents" role="operator">
      {page}
    </ShellStory>
  ),
};

/** No Settings area, no Evidence, no Providers. */
export const Viewer: Story = {
  render: () => (
    <ShellStory path="/agents" role="viewer">
      {page}
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const name of ["General", "Evidence", "Providers"]) {
      await expect(
        canvas.queryByRole("link", { name }),
      ).not.toBeInTheDocument();
    }
    await expect(
      canvas.getByRole("link", { name: "Risks" }),
    ).toBeInTheDocument();
  },
};

export const AssistantHidden: Story = {
  render: () => (
    <ShellStory path="/agents" defaultAssistantHidden>
      {page}
    </ShellStory>
  ),
};

/** The user menu opens the language dialog; personal settings live here, not in Settings. */
export const LanguageFromUserMenu: Story = {
  render: () => (
    <ShellStory
      path="/dashboard"
      defaultAssistantHidden
      locales={CATALOG_LOCALES}
    >
      <PageFrame title="Overview">
        <EmptyState title="The Overview screen renders here" />
      </PageFrame>
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(canvasElement.ownerDocument.body);
    await userEvent.click(canvas.getByRole("button", { name: /Leo Mata/ }));
    await userEvent.click(
      await body.findByRole("menuitem", { name: /Language: English/ }),
    );
    await userEvent.click(await body.findByRole("radio", { name: "French" }));
    await userEvent.click(body.getByRole("button", { name: "Apply" }));
    await userEvent.click(canvas.getByRole("button", { name: /Leo Mata/ }));
    await expect(
      await body.findByRole("menuitem", { name: /Language: French/ }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
};

/** Labels through the app's catalog (localizeNav), here a stand-in German one. */
export const Translated: Story = {
  render: () => (
    <ShellStory
      path="/policies"
      defaultAssistantHidden
      translate={(_kind, key, fallback) =>
        ({ policies: "Richtlinien", agents: "Agenten", activity: "Aktivität" })[
          key
        ] ?? fallback
      }
      labels={{
        assistant: "Assistent",
        language: "Sprache",
        appearance: "Darstellung",
      }}
    >
      <PageFrame title="Richtlinien">
        <EmptyState title="Hier erscheinen die Richtlinien" />
      </PageFrame>
    </ShellStory>
  ),
};

/**
 * As the console mounts it today: rows without a screen left out, and the
 * pages a function will fold into tabs shown as an interim tab row.
 */
export const Console: Story = {
  render: () => (
    <ShellStory
      path="/usage/budgets"
      defaultAssistantHidden
      hiddenRoutes={UNBUILT_ROUTES}
      tabs={interimTabs("/usage/budgets", ["view", "mutate", "admin"])}
    >
      <PageFrame title="Budgets">
        <EmptyState title="The old page renders here" />
      </PageFrame>
    </ShellStory>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.queryByRole("link", { name: "Reports" }),
    ).not.toBeInTheDocument();
    const tabs = within(canvas.getByRole("navigation", { name: "Pages" }));
    await expect(tabs.getByRole("link", { name: "Budgets" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(tabs.getByRole("link", { name: "Usage" })).toHaveAttribute(
      "href",
      "/usage",
    );
  },
};

export const Mobile: Story = {
  globals: { viewport: { value: "mobile2", isRotated: false } },
  render: () => <ShellStory path="/agents">{page}</ShellStory>,
};
