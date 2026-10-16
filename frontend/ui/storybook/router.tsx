/**
 * A router for stories: links change a path held in state, so the sidebar,
 * the breadcrumb switcher and the tabs work inside Storybook. The app passes
 * next/link to UIProvider instead.
 */
import { type LinkProps, UIProvider } from "@calliopelabs/ui";
import * as React from "react";

const PathContext = React.createContext<{
  path: string;
  go: (path: string) => void;
}>({ path: "/", go: () => {} });

export function usePath() {
  return React.useContext(PathContext);
}

function StoryLink({ ref, href, onClick, children, ...props }: LinkProps) {
  const { go } = usePath();
  return (
    <a
      ref={ref}
      href={href}
      {...props}
      onClick={(event) => {
        event.preventDefault();
        onClick?.(event);
        if (href.startsWith("/")) go(href);
      }}
    >
      {children}
    </a>
  );
}

export function StoryRouter({
  initialPath,
  children,
}: {
  initialPath: string;
  children: React.ReactNode;
}) {
  const [path, setPath] = React.useState(initialPath);
  const value = React.useMemo(() => ({ path, go: setPath }), [path]);
  return (
    <PathContext.Provider value={value}>
      <UIProvider link={StoryLink}>{children}</UIProvider>
    </PathContext.Provider>
  );
}
