import type { Metadata } from "next";
import { ApolloWrapper } from "@/lib/apollo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ConfirmProvider } from "@/hooks/use-confirm";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "@/components/Toaster";
import { AppearanceRoot } from "@/components/AppearanceRoot";
import { AppearanceScript } from "@calliopelabs/ui";
import { zentinelle } from "@/ui/product";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Zentinelle",
    template: "%s · Zentinelle",
  },
  description: "AI Agent Governance, Risk & Compliance",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <AppearanceScript product={zentinelle} />
      </head>
      <body className="antialiased">
        <AppearanceRoot>
          <Toaster />
          <NextIntlClientProvider locale={locale} messages={messages}>
            <ApolloWrapper>
              <TooltipProvider>
                <ConfirmProvider>{children}</ConfirmProvider>
              </TooltipProvider>
            </ApolloWrapper>
          </NextIntlClientProvider>
        </AppearanceRoot>
      </body>
    </html>
  );
}
