/**
 * The shell as a screen story mounts it: at a path, as a role, with links
 * that move inside the story. Area agents render their screen as the
 * children: `<ShellStory path="/policies" role="operator"><PoliciesScreen …/></ShellStory>`.
 */
import * as React from "react";

import type { Role } from "../product";
import {
  ZentinelleShell,
  type ZentinelleShellProps,
} from "../shell/ZentinelleShell";
import { StoryRouter, usePath } from "./router";
import { STORY_LOCALES, STORY_USER, capabilitiesOf } from "./session";

export interface ShellStoryProps extends Partial<
  Omit<ZentinelleShellProps, "pathname" | "children">
> {
  path: string;
  role?: Role;
  /** The page, or a function of the current path for stories that navigate. */
  children: React.ReactNode | ((path: string) => React.ReactNode);
}

function AtPath({ role, children, ...props }: Omit<ShellStoryProps, "path">) {
  const { path } = usePath();
  const [locale, setLocale] = React.useState("en");
  return (
    <ZentinelleShell
      pathname={path}
      capabilities={capabilitiesOf(role ?? "admin")}
      user={STORY_USER}
      locale={locale}
      locales={STORY_LOCALES}
      onLocaleChange={setLocale}
      onSignOut={() => {}}
      {...props}
    >
      {typeof children === "function" ? children(path) : children}
    </ZentinelleShell>
  );
}

export function ShellStory({ path, ...props }: ShellStoryProps) {
  return (
    <StoryRouter initialPath={path}>
      <AtPath {...props} />
    </StoryRouter>
  );
}
