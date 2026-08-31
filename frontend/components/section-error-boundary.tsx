"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { TriangleAlertIcon } from "lucide-react";

type Props = {
  /** Named in the fallback, so an operator can say which panel failed. */
  section: string;
  children: ReactNode;
};

type State = { error: Error | null };

/**
 * Keeps one failed panel from taking the page with it.
 *
 * A dashboard renders several independent visualisations off one query. React
 * unmounts the whole tree when any component throws, so a single malformed
 * series — a null where a number was expected, a category the chart library
 * will not accept — replaced the entire page with a blank screen and no
 * explanation. On a console whose subject is evidence, a blank page and a
 * broken panel look identical, and the second one is far more common.
 *
 * A class, because `componentDidCatch` has no hook equivalent: catching a
 * render error is the one thing React still does only this way.
 *
 * Deliberately no retry button. Whatever the panel choked on is in the data it
 * was given, and re-rendering the same data throws again; the honest actions
 * are reloading the page or fixing the source, and a button that appears to
 * offer a third is worse than no button.
 */
export class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logged rather than swallowed: the fallback tells the operator which panel
    // failed, and this is the only place the reason survives.
    console.error(
      `[${this.props.section}] section failed to render`,
      error,
      info,
    );
  }

  render() {
    if (this.state.error) {
      return (
        <div className="border-destructive/30 bg-destructive/5 text-muted-foreground flex items-start gap-2 rounded-lg border p-4 text-sm">
          <TriangleAlertIcon className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="text-foreground font-medium">
              {this.props.section} could not be displayed
            </p>
            <p className="mt-1 text-xs">
              The rest of this page is unaffected. Reload to try again.
            </p>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
