"use client";

import { AppearanceProvider } from "@calliopelabs/ui";
import type { ReactNode } from "react";

import { zentinelle } from "@/ui/product";

/** Ground, accent and light/dark from the library, with the Zentinelle brand. */
export function AppearanceRoot({ children }: { children: ReactNode }) {
  return (
    <AppearanceProvider product={zentinelle}>{children}</AppearanceProvider>
  );
}
