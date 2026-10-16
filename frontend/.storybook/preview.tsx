import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "@fontsource-variable/dm-sans/index.css";
import "./storybook.css";

import {
  AppearanceProvider,
  CORNERS,
  DENSITY_KEYS,
  UIProvider,
  productStyles,
  type Appearance,
  type LinkProps,
} from "@calliopelabs/ui";
import type { Decorator, Preview } from "@storybook/react-vite";
import * as React from "react";

import { zentinelle } from "../ui/product";
import { GraphQLMocks, type GraphQLParameters } from "../ui/storybook/graphql";

/** Links in the catalog go nowhere: following one would navigate the preview frame away. */
function StoryLink({ ref, href, onClick, children, ...props }: LinkProps) {
  return (
    <a
      ref={ref}
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

/**
 * The toolbar's appearance, as the person's preference. Controlled, so the
 * toolbar never fights localStorage; the picker in the user menu changes it
 * here until the toolbar moves again.
 */
function StoryAppearance({
  globals,
  children,
}: {
  globals: Record<string, string>;
  children: React.ReactNode;
}) {
  const [value, setValue] = React.useState<Partial<Appearance> | null>(() => ({
    ground: globals.ground as Appearance["ground"],
    accent:
      globals.accent === "product"
        ? zentinelle.defaults.accent
        : globals.accent,
    density: globals.density as Appearance["density"],
    corners: Number(globals.corners) as Appearance["corners"],
  }));
  return (
    <>
      <style data-calliope-ui="product">{productStyles(zentinelle)}</style>
      <AppearanceProvider
        product={zentinelle}
        value={value}
        onChange={setValue}
      >
        {children}
      </AppearanceProvider>
    </>
  );
}

const withProviders: Decorator = (Story, context) => {
  const globals = context.globals as Record<string, string>;
  const graphql = context.parameters.graphql as GraphQLParameters | undefined;
  return (
    <UIProvider link={StoryLink}>
      <StoryAppearance key={JSON.stringify(globals)} globals={globals}>
        <GraphQLMocks mocks={graphql?.mocks}>
          <Story />
        </GraphQLMocks>
      </StoryAppearance>
    </UIProvider>
  );
};

const toolbar = (
  title: string,
  items: readonly (string | { value: string; title: string })[],
) => ({
  description: title,
  toolbar: { title, items: [...items], dynamicTitle: true },
});

const preview: Preview = {
  decorators: [withProviders],
  // Each story starts from a person who has never folded a rail.
  beforeEach() {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith("zentinelle.shell."))
        window.localStorage.removeItem(key);
    }
  },
  globalTypes: {
    ground: toolbar("Ground", zentinelle.grounds),
    accent: toolbar("Accent", [
      { value: "product", title: "Product accent" },
      ...zentinelle.accents
        .filter((a) => !a.brand)
        .map((a) => ({ value: a.key, title: a.label })),
    ]),
    density: toolbar("Density", DENSITY_KEYS),
    corners: toolbar(
      "Corners",
      CORNERS.map((c) => ({ value: String(c), title: `${c}px` })),
    ),
  },
  initialGlobals: {
    ground: zentinelle.defaults.ground.dark,
    accent: "product",
    density: zentinelle.defaults.density,
    corners: String(zentinelle.defaults.corners),
  },
  parameters: {
    layout: "padded",
    backgrounds: { disable: true },
    controls: { expanded: true },
    a11y: {
      // Fail on violations (the story render test runs this too), against
      // the WCAG A and AA rules; best-practice rules are advice, not a gate.
      test: "error",
      options: {
        runOnly: {
          type: "tag",
          values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
        },
      },
    },
  },
};

export default preview;
