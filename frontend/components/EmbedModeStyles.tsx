"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

/**
 * When the URL has ?embed=1, hide the chrome (sidebar, header, chat bubble)
 * via a body-level CSS class. Used to make the portal iframe-friendly so
 * marketing sites can embed the live tour without showing the operator UI.
 *
 * The class is also persisted to sessionStorage so embed mode survives
 * route changes that don't carry the query param. The DemoTour component
 * propagates the param when navigating, but in case it doesn't…
 */
export function EmbedModeStyles() {
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const fromUrl = searchParams.get("embed") === "1";
    const fromStorage = sessionStorage.getItem("zentinelle:embed") === "1";
    const isEmbed = fromUrl || fromStorage;

    if (isEmbed) {
      document.body.classList.add("zentinelle-embed");
      sessionStorage.setItem("zentinelle:embed", "1");
    } else {
      document.body.classList.remove("zentinelle-embed");
    }
  }, [searchParams]);

  return null;
}
