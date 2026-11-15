"use client";

import { type LinkProps, type Messages, UIProvider } from "@calliopelabs/ui";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";

/**
 * The environment @calliopelabs/ui components read through `useUI()`: the
 * app's link and every string the library renders, from the `ui` namespace
 * of the message catalog. Mount inside NextIntlClientProvider. The app passes
 * next/link; the catalog passes a link that stays in the story.
 */
export function UiEnvironment({
  link,
  children,
}: {
  link: React.ComponentType<LinkProps>;
  children: React.ReactNode;
}) {
  const t = useTranslations("ui");
  const locale = useLocale();

  const messages = React.useMemo<Messages>(() => {
    // A label mid-sentence: English lowercases it ("Show assistant"); other
    // locales keep the caller's casing.
    const noun = (label: string) =>
      locale.startsWith("en") ? label.toLocaleLowerCase(locale) : label;
    return {
      shell: {
        skipToContent: t("shell.skipToContent"),
        navigation: t("shell.navigation"),
        close: t("shell.close"),
      },
      nav: {
        label: t("nav.label"),
        collapse: t("nav.collapse"),
        expand: t("nav.expand"),
        collapseTitle: t("nav.collapseTitle"),
        expandTitle: t("nav.expandTitle"),
      },
      rail: {
        show: (label) => t("rail.show", { label: noun(label) }),
        hide: (label) => t("rail.hide", { label: noun(label) }),
        resize: (label) => t("rail.resize", { label: noun(label) }),
        expand: (label) => t("rail.expand", { label: noun(label) }),
        restore: (label) => t("rail.restore", { label: noun(label) }),
      },
      breadcrumb: {
        label: t("breadcrumb.label"),
        switchFrom: (label) => t("breadcrumb.switchFrom", { label }),
      },
      table: {
        search: t("table.search"),
        clearSearch: t("table.clearSearch"),
        results: (count) => t("table.results", { count }),
        filteredResults: t("table.filteredResults"),
        loading: t("table.loading"),
        loadFailed: (label) => t("table.loadFailed", { label: noun(label) }),
        requestFailed: t("table.requestFailed"),
        retry: t("table.retry"),
        noMatches: t("table.noMatches"),
        noMatchesDescription: (label) =>
          t("table.noMatchesDescription", { label: noun(label) }),
        selected: (count) => t("table.selected", { count }),
        clearSelection: t("table.clearSelection"),
        selectRow: (id) => t("table.selectRow", { id }),
        selectPage: (label) => t("table.selectPage", { label: noun(label) }),
        actions: t("table.actions"),
        rowActions: (label) => t("table.rowActions", { label }),
        rowsPerPage: t("table.rowsPerPage"),
        page: (page) => t("table.page", { page }),
        previousPage: t("table.previousPage"),
        nextPage: t("table.nextPage"),
        sortKey: (index) => t("table.sortKey", { index }),
      },
      states: {
        errorTitle: t("states.errorTitle"),
        unexpected: t("states.unexpected"),
        retry: t("states.retry"),
        errorId: (digest) => t("states.errorId", { digest }),
        loading: t("states.loading"),
        learnMore: t("states.learnMore"),
      },
      dialog: { close: t("dialog.close") },
      confirm: {
        confirm: t("confirm.confirm"),
        cancel: t("confirm.cancel"),
        working: t("confirm.working"),
        failed: t("confirm.failed"),
        reasonRequired: t("confirm.reasonRequired"),
      },
      user: {
        accountMenu: (name, initials) =>
          t("user.accountMenu", { name, initials }),
        signOut: t("user.signOut"),
      },
      appearance: {
        locked: t("appearance.locked"),
        themes: t("appearance.themes"),
        accent: t("appearance.accent"),
        ground: t("appearance.ground"),
        density: t("appearance.density"),
        corners: t("appearance.corners"),
        reset: t("appearance.reset"),
        // Theme, ground and accent names come from the product; they are
        // brand names, kept as the product spells them.
        themeName: (theme) => theme.name,
        themeHint: (theme) => theme.hint,
        mode: (mode) => t(`appearance.modes.${mode}`),
        groundLabel: (_ground, label) => label,
        accentLabel: (_accent, label) => label,
        densityLabel: (density) => t(`appearance.densities.${density}.label`),
        densityHint: (density) => t(`appearance.densities.${density}.hint`),
        cornersLabel: (corners) =>
          corners === 0
            ? t("appearance.cornerSquare")
            : corners === 10
              ? t("appearance.cornerRounded")
              : t("appearance.cornerPixels", { corners }),
        customAccent: t("appearance.customAccent"),
        customAccentPick: t("appearance.customAccentPick"),
        customAccentHelp: t("appearance.customAccentHelp"),
        customAccentInvalid: t("appearance.customAccentInvalid"),
        customAccentInUse: t("appearance.customAccentInUse"),
        customAccentOk: (ratio) => t("appearance.customAccentOk", { ratio }),
        customAccentFaint: (ratio, min, mode) =>
          t("appearance.customAccentFaint", { ratio, min, mode }),
      },
    };
  }, [t, locale]);

  return (
    <UIProvider link={link} messages={messages}>
      {children}
    </UIProvider>
  );
}
