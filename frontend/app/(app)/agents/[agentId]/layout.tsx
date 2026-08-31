import { AgentShell } from "./agent-shell";

/**
 * Takes only children, deliberately.
 *
 * Next's typed-route map does not generate correctly in this project — its own
 * validator fails with `Type 'Route' does not satisfy the constraint '"/"'` —
 * so any layout that declares `params` fails the generated LayoutConfig check.
 * This is the app's first dynamic-segment layout, so it is the first to hit it.
 * AgentShell reads the slug off the pathname instead.
 */
export default function AgentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AgentShell>{children}</AgentShell>;
}
