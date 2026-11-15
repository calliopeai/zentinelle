"use client";

import {
  type LinkProps,
  type MessageOverrides,
  UIProvider,
} from "@calliopelabs/ui";
import { useLocale, useTranslations } from "next-intl";
import * as React from "react";

/**
 * The environment @calliopelabs/ui components read through `useUI()`: the
 * app's link and every string Zentinelle shows from the library, from the
 * `ui` namespace of the message catalog (groups it does not use, such as the
 * workflow editor's, keep the library's English). Mount inside
 * NextIntlClientProvider. The app passes
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

  const messages = React.useMemo<MessageOverrides>(() => {
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
      data: {
        noValue: t("data.noValue"),
        notSet: t("data.notSet"),
        removeTag: (label) => t("data.removeTag", { label }),
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
      chat: {
        conversation: t("chat.conversation"),
        empty: t("chat.empty"),
        emptyDescription: t("chat.emptyDescription"),
        role: (role) => t(`chat.roles.${role}`),
        messageFrom: (speaker) => t("chat.messageFrom", { speaker }),
        thinking: t("chat.thinking"),
        writing: t("chat.writing"),
        jumpToLatest: t("chat.jumpToLatest"),
        runFailed: t("chat.runFailed"),
        retry: t("chat.retry"),
        composer: t("chat.composer"),
        placeholder: t("chat.placeholder"),
        composerHint: t("chat.composerHint"),
        send: t("chat.send"),
        stop: t("chat.stop"),
        attachments: t("chat.attachments"),
        toolCall: (name) => t("chat.toolCall", { name }),
        toolStatus: (status) => t(`chat.toolStatus.${status}`),
        details: t("chat.details"),
        arguments: t("chat.arguments"),
        noArguments: t("chat.noArguments"),
        result: t("chat.result"),
        toolError: t("chat.toolError"),
        approvalNeeded: t("chat.approvalNeeded"),
        approve: t("chat.approve"),
        deny: t("chat.deny"),
        approveTitle: (name) => t("chat.approveTitle", { name }),
        approveDescription: t("chat.approveDescription"),
        denyTitle: (name) => t("chat.denyTitle", { name }),
        denyDescription: t("chat.denyDescription"),
        denyReason: t("chat.denyReason"),
        progress: t("chat.progress"),
        steps: t("chat.steps"),
        runStatus: (status) => t(`chat.runStatus.${status}`),
        model: t("chat.model"),
      },
      agent: {
        // The surfaces pass the assistant's own name (overview.assistant.title).
        title: (product) => product ?? "Zentinelle AI",
        open: (title) => t("agent.open", { title }),
        close: t("agent.close"),
        unread: (count) => t("agent.unread", { count }),
        newConversation: t("agent.newConversation"),
        expand: t("agent.expand"),
        restore: t("agent.restore"),
        suggestions: t("agent.suggestions"),
        emptyTitle: t("agent.emptyTitle"),
        emptyDescription: t("agent.emptyDescription"),
        waitingOnYou: t("agent.waitingOnYou"),
        shortcut: (keys) => t("agent.shortcut", { keys }),
        interrupt: t("agent.interrupt"),
        decline: t("agent.decline"),
        back: t("agent.back"),
        sendReview: t("agent.sendReview"),
        sharedState: t("agent.sharedState"),
      },
    };
  }, [t, locale]);

  return (
    <UIProvider link={link} messages={messages}>
      {children}
    </UIProvider>
  );
}
