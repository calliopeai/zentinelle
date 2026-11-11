"use client";

import {
  AppShell,
  BrandMark,
  Button,
  RailPanel,
  Sidebar,
  UserMenu,
  activeFor,
  localizeNav,
  useRailState,
  useRailWidth,
} from "@calliopelabs/ui";
import {
  BookOpenIcon,
  LanguagesIcon,
  PaletteIcon,
  SparklesIcon,
} from "lucide-react";
import * as React from "react";

import { navFor } from "../product";
import { AppearanceDialog } from "./AppearanceDialog";
import { AssistantPlaceholder } from "./AssistantPlaceholder";
import { LanguageDialog, type LanguageOption } from "./LanguageDialog";

export interface ShellLabels {
  assistant: string;
  language: string;
  appearance: string;
  documentation: string;
}

const DEFAULT_LABELS: ShellLabels = {
  assistant: "Assistant",
  language: "Language",
  appearance: "Appearance",
  documentation: "Documentation",
};

export interface ZentinelleShellProps {
  /** The current path, from the router; picks the active row. */
  pathname: string;
  /** `/auth/me` capabilities (`view`, `mutate`, `admin`): rows the person cannot open are not shown. */
  capabilities: readonly string[];
  user: { name: string; email: string };
  locale: string;
  locales: readonly LanguageOption[];
  onLocaleChange: (locale: string) => void;
  onSignOut: () => void;
  /** Nav labels through the app's message catalog (`localizeNav`). English when absent. */
  translate?: (
    kind: "area" | "group" | "function",
    key: string,
    fallback: string,
  ) => string;
  labels?: Partial<ShellLabels>;
  /** The assistant dock's content. A placeholder until zentinelle#447 lands. */
  assistant?: React.ReactNode;
  documentationHref?: string;
  /** Before anything is stored: whether the dock starts hidden. Stored state wins. */
  defaultAssistantHidden?: boolean;
  children: React.ReactNode;
}

const MARK = (
  // eslint-disable-next-line @next/next/no-img-element -- the package hands the mark through as-is; next/image is not app-agnostic.
  <img src="/logo-icon.svg" alt="" width={24} height={24} />
);

/**
 * The Zentinelle AI console frame (ui-overhaul-ia §5): the seven areas on
 * the navy sidebar, filtered by role; the content; the assistant docked on
 * the right (400px, 320 to 560, collapsing to nothing, full width on demand,
 * `]` or the header button). Pure: path, person and callbacks come in from
 * the route layout, so it renders the same in Storybook and in Next.
 */
export function ZentinelleShell({
  pathname,
  capabilities,
  user,
  locale,
  locales,
  onLocaleChange,
  onSignOut,
  translate,
  labels: labelOverrides,
  assistant,
  documentationHref = "https://zentinelle.dev",
  defaultAssistantHidden = false,
  children,
}: ZentinelleShellProps) {
  const labels = { ...DEFAULT_LABELS, ...labelOverrides };
  const nav = React.useMemo(() => {
    const visible = navFor(capabilities);
    return translate ? localizeNav(visible, translate) : visible;
  }, [capabilities, translate]);
  const active = activeFor(nav, pathname);

  const [sidebarCollapsed, setSidebarCollapsed] = useRailState(
    "zentinelle.shell.main",
  );
  const [dockHidden, setDockHidden] = useRailState(
    "zentinelle.shell.assistant",
    () => defaultAssistantHidden,
  );
  const [dockWidth, setDockWidth] = useRailWidth(
    "zentinelle.shell.assistant.width",
    400,
    { min: 320, max: 560 },
  );
  const [dockFull, setDockFull] = React.useState(false);
  const [dialog, setDialog] = React.useState<"language" | "appearance" | null>(
    null,
  );

  return (
    <>
      <AppShell
        onToggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        onToggleRightRail={() => setDockHidden(!dockHidden)}
        header={
          <div className="flex w-full items-center justify-end">
            {/* Beside the content only: below md the shell's top bar opens the dock as a drawer. */}
            <Button
              size="sm"
              variant={dockHidden ? "outline" : "secondary"}
              aria-pressed={!dockHidden}
              title={`${labels.assistant} (])`}
              onClick={() => setDockHidden(!dockHidden)}
              className="hidden md:inline-flex"
            >
              <SparklesIcon aria-hidden /> {labels.assistant}
            </Button>
          </div>
        }
        sidebar={
          <Sidebar
            nav={nav}
            active={active}
            collapsed={sidebarCollapsed}
            onCollapsedChange={setSidebarCollapsed}
            header={<BrandMark href="/dashboard" mark={MARK} />}
            headerCollapsed={
              <BrandMark href="/dashboard" mark={MARK} collapsed />
            }
            footer={
              <UserMenu
                name={user.name}
                email={user.email}
                collapsed={sidebarCollapsed}
                onSignOut={onSignOut}
                groups={[
                  [
                    {
                      label: `${labels.language}: ${locales.find((l) => l.value === locale)?.label ?? locale}`,
                      icon: LanguagesIcon,
                      onSelect: () => setDialog("language"),
                    },
                    {
                      label: labels.appearance,
                      icon: PaletteIcon,
                      onSelect: () => setDialog("appearance"),
                    },
                  ],
                  [
                    {
                      label: labels.documentation,
                      icon: BookOpenIcon,
                      href: documentationHref,
                    },
                  ],
                ]}
              />
            }
          />
        }
        rightRail={
          <RailPanel
            label={labels.assistant}
            collapsed={dockHidden}
            onCollapsedChange={setDockHidden}
            collapsedMode="hidden"
            width={dockWidth}
            minWidth={320}
            maxWidth={560}
            onWidthChange={setDockWidth}
            expanded={dockFull}
            onExpandedChange={setDockFull}
          >
            {assistant ?? <AssistantPlaceholder />}
          </RailPanel>
        }
        rightRailLabel={labels.assistant}
        rightRailExpanded={dockFull && !dockHidden}
      >
        {children}
      </AppShell>
      <LanguageDialog
        open={dialog === "language"}
        onOpenChange={(open) => setDialog(open ? "language" : null)}
        locale={locale}
        locales={locales}
        onLocaleChange={onLocaleChange}
        title={labels.language}
      />
      <AppearanceDialog
        open={dialog === "appearance"}
        onOpenChange={(open) => setDialog(open ? "appearance" : null)}
        title={labels.appearance}
      />
    </>
  );
}
