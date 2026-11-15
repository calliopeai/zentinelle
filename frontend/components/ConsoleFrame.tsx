"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import * as React from "react";

import { setLocale } from "@/app/actions/locale";
import { ChatBubble } from "@/components/ChatBubble";
import { UiEnvironment } from "@/components/UiEnvironment";
import { pickerLocales, type Locale } from "@/i18n/config";
import { logout, type SessionUser } from "@/lib/auth/session";
import { UNBUILT_ROUTES, interimTabs } from "@/ui/product";
import { ZentinelleShell } from "@/ui/shell/ZentinelleShell";

const EMBED_KEY = "zentinelle:embed";

/**
 * `?embed=1` (or an earlier page of this tab that had it) renders the page
 * with no chrome, so a marketing site can show the live tour. Kept in
 * sessionStorage so it survives navigations that drop the parameter.
 */
function embedNow(): boolean {
  return (
    new URLSearchParams(window.location.search).get("embed") === "1" ||
    sessionStorage.getItem(EMBED_KEY) === "1"
  );
}

const noSubscription = () => () => {};

function useEmbedMode(enabled: boolean): boolean {
  const pathname = usePathname();
  const embed = React.useSyncExternalStore(
    noSubscription,
    () => enabled && embedNow(),
    () => false,
  );
  React.useEffect(() => {
    if (embed) sessionStorage.setItem(EMBED_KEY, "1");
  }, [embed, pathname]);
  return embed;
}

/**
 * The (app) layout's client half: the Zentinelle shell around every page,
 * with the signed-in person, the language cookie and next/link wired in.
 */
export function ConsoleFrame({
  user,
  embeddable,
  children,
}: {
  user: SessionUser;
  /** Whether `?embed=1` may drop the chrome (the open-mode demo). */
  embeddable: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("language");
  const embed = useEmbedMode(embeddable);
  const capabilities = user.capabilities ?? [];

  if (embed) {
    return (
      <UiEnvironment link={Link}>
        <main className="min-h-dvh p-4">{children}</main>
      </UiEnvironment>
    );
  }

  return (
    <UiEnvironment link={Link}>
      <ZentinelleShell
        pathname={pathname}
        capabilities={capabilities}
        user={{ name: user.username, email: user.email }}
        locale={locale}
        locales={pickerLocales.map((value) => ({ value, label: t(value) }))}
        onLocaleChange={async (next) => {
          await setLocale(next as Locale);
          router.refresh();
        }}
        onSignOut={async () => {
          await logout();
          window.location.href = "/auth/login";
        }}
        // The dock stays empty until the assistant lands (zentinelle#447);
        // ChatBubble is the working assistant meanwhile.
        defaultAssistantHidden
        hiddenRoutes={UNBUILT_ROUTES}
        tabs={interimTabs(pathname, capabilities)}
      >
        {children}
      </ZentinelleShell>
      <ChatBubble />
    </UiEnvironment>
  );
}
