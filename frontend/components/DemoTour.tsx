"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter, usePathname } from "next/navigation";
import { driver, type Driver } from "driver.js";
import "driver.js/dist/driver.css";

import { MAIN_TOUR, type TourStep } from "@/lib/tours/main-tour";

const STORAGE_KEY = "zentinelle:demo-tour:step";
const ACTIVE_KEY = "zentinelle:demo-tour:active";

/**
 * DemoTour orchestrates a multi-page guided walkthrough using driver.js.
 *
 * Mounted globally (in the (app) layout) but only renders/activates when
 * sessionStorage flag is set — turned on by /demo route or ?tour=1 param.
 *
 * Across route changes the component picks up where it left off via the
 * persisted step index, so tour steps that include `route:` work correctly.
 */
export function DemoTour() {
  const router = useRouter();
  const pathname = usePathname();
  const driverRef = useRef<Driver | null>(null);
  const [active, setActive] = useState(false);

  // Sync active state from sessionStorage (set by /demo or ?tour=1)
  useEffect(() => {
    if (typeof window === "undefined") return;
    setActive(sessionStorage.getItem(ACTIVE_KEY) === "1");
  }, [pathname]);

  const stop = useCallback(() => {
    if (driverRef.current) {
      driverRef.current.destroy();
      driverRef.current = null;
    }
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(ACTIVE_KEY);
    setActive(false);
  }, []);

  const goToStep = useCallback(
    (index: number) => {
      if (index < 0 || index >= MAIN_TOUR.length) {
        stop();
        return;
      }
      const step: TourStep = MAIN_TOUR[index];
      sessionStorage.setItem(STORAGE_KEY, String(index));

      const renderHere = () => {
        // Clean any prior instance
        if (driverRef.current) {
          driverRef.current.destroy();
        }
        const total = MAIN_TOUR.length;
        const isLast = index === total - 1;
        const isFirst = index === 0;
        driverRef.current = driver({
          showProgress: true,
          allowClose: true,
          progressText: `${index + 1} of ${total}`,
          nextBtnText: isLast ? "Finish" : "Next",
          doneBtnText: isLast ? "Finish" : "Next",
          prevBtnText: "Back",
          showButtons: isFirst
            ? ["next", "close"]
            : ["next", "previous", "close"],
          steps: [
            {
              element: step.element,
              popover: {
                title: step.popover.title,
                description: step.popover.description,
                side: step.popover.side,
                align: step.popover.align,
                onNextClick: () => goToStep(index + 1),
                onPrevClick: () => goToStep(index - 1),
                onCloseClick: () => stop(),
              },
            },
          ],
          onDestroyed: () => {
            if (isLast) stop();
          },
        });
        driverRef.current.drive();
      };

      // Navigate first if needed, then render after route resolves
      if (step.route && step.route !== pathname) {
        // Preserve embed mode across route changes
        const isEmbed =
          typeof window !== "undefined" &&
          sessionStorage.getItem("zentinelle:embed") === "1";
        const target = isEmbed ? `${step.route}?embed=1` : step.route;
        router.push(target);
      } else {
        // Wait a tick for any element to appear (data fetches, etc.)
        setTimeout(renderHere, 250);
      }
    },
    [pathname, router, stop]
  );

  // When pathname matches the current step's route, render the popover
  useEffect(() => {
    if (!active) return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === null) return;
    const index = Number.parseInt(stored, 10);
    if (Number.isNaN(index)) return;
    const step = MAIN_TOUR[index];
    if (!step) return;
    if (step.route && step.route !== pathname) return;
    // Defer to let the page render
    const t = setTimeout(() => {
      goToStep(index);
    }, 350);
    return () => clearTimeout(t);
  }, [active, pathname, goToStep]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (driverRef.current) {
        driverRef.current.destroy();
      }
    };
  }, []);

  if (!active) return null;
  return (
    <div className="pointer-events-none fixed top-0 left-0 right-0 z-[9000] flex justify-center">
      <div className="pointer-events-auto mt-2 rounded-full bg-amber-500/15 border border-amber-500/40 px-3 py-1 text-xs text-amber-100 backdrop-blur">
        <span className="font-medium">Demo tour active</span>
        <button
          onClick={stop}
          className="ml-3 underline underline-offset-2 hover:text-amber-300"
        >
          End tour
        </button>
      </div>
    </div>
  );
}

/**
 * Programmatic API to start the tour from anywhere.
 * Used by /demo route and the "Start tour" button.
 */
export function startDemoTour() {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ACTIVE_KEY, "1");
  sessionStorage.setItem(STORAGE_KEY, "0");
  // Trigger a navigation so the global DemoTour component re-syncs
  window.dispatchEvent(new Event("zentinelle:tour:start"));
}
