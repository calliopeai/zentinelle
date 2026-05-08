/**
 * Zentinelle live demo tour — narrated click-through of the platform.
 *
 * Each step renders a popover with copy and a Next/Back button. Steps that
 * specify `route` will navigate first, then highlight the `element` selector
 * once the page is ready.
 */

export interface TourStep {
  /** Optional route to navigate to before this step */
  route?: string;
  /** CSS selector to spotlight, or null for a centered popover */
  element?: string;
  popover: {
    title: string;
    description: string;
    side?: "left" | "right" | "top" | "bottom" | "over";
    align?: "start" | "center" | "end";
  };
}

export const MAIN_TOUR: TourStep[] = [
  {
    popover: {
      title: "Welcome to Zentinelle",
      description:
        "AI agent governance, risk, and compliance — in one platform. " +
        "This is a live, interactive demo running against real data. " +
        "Click <b>Next</b> to start the 90-second tour.",
    },
  },
  {
    route: "/dashboard",
    element: "[data-tour='dashboard-stats']",
    popover: {
      title: "Real-time agent health",
      description:
        "Every registered agent reports heartbeats, capabilities, and " +
        "policy decisions. The dashboard surfaces fleet health at a glance: " +
        "active count, policy violations today, recent anomalies.",
      side: "bottom",
      align: "center",
    },
  },
  {
    route: "/agents",
    element: "[data-tour='agents-table']",
    popover: {
      title: "Agent registry",
      description:
        "Every AI agent — Claude Code, Codex, LangChain, custom — registers " +
        "here with a unique key. Zentinelle then sits between the agent and " +
        "its LLM provider, enforcing your governance rules.",
      side: "top",
    },
  },
  {
    route: "/policies",
    element: "[data-tour='policies-heatmap']",
    popover: {
      title: "Policy coverage at a glance",
      description:
        "24 policy types × 5 inheritance scopes (Org → Team → Deployment → " +
        "Endpoint → User). Green cells = enforced, amber = audit-only, dashed " +
        "= no policy. Hover any cell to see what's defined.",
      side: "top",
    },
  },
  {
    route: "/policies",
    element: "[data-tour='policies-table'] tbody tr:first-child",
    popover: {
      title: "Click any policy to drill in",
      description:
        "Each policy ships with versioning, a simulator (dry-run against " +
        "historical events), and a conflict analyzer. We'll keep moving — " +
        "click Next.",
      side: "right",
    },
  },
  {
    route: "/risks",
    element: "[data-tour='risk-overview']",
    popover: {
      title: "FMEA risk register",
      description:
        "Every risk scored on Severity × Likelihood × Impact (Fibonacci). " +
        "RPN ranges 1–512, color-coded. Comes with a 5×5 matrix and 30-day " +
        "trend so you can show movement to leadership.",
      side: "bottom",
    },
  },
  {
    route: "/compliance",
    element: "[data-tour='compliance-frameworks']",
    popover: {
      title: "Compliance, automated",
      description:
        "SOC 2, GDPR, HIPAA, EU AI Act, NIST AI RMF — each control mapped " +
        "to Zentinelle features. Gap analysis flags missing capabilities " +
        "and gives remediation guidance.",
      side: "top",
    },
  },
  {
    route: "/audit-logs",
    element: "[data-tour='audit-chain']",
    popover: {
      title: "Tamper-evident audit log",
      description:
        "Every config change is hash-chained. The Verify button recomputes " +
        "the chain — if anyone tampered, you'd see exactly where it broke. " +
        "Export to your SIEM in JSON, CSV, or via webhook.",
      side: "bottom",
    },
  },
  {
    route: "/agents",
    element: "[data-tour='ai-assistant-bubble']",
    popover: {
      title: "Ask the GRC assistant",
      description:
        "The blue sparkle in the corner — that's an LLM with 22 tools " +
        "wired into your real data. 'What policies are missing?' 'Create a " +
        "rate-limit policy of 60/min.' 'Acknowledge incident X.' Try it.",
      side: "left",
    },
  },
  {
    popover: {
      title: "That's the tour",
      description:
        "<p>Stay in the demo as long as you like — your changes are sandboxed.</p>" +
        "<p style='margin-top:0.75rem'>" +
        "Ready to deploy? <a href='https://github.com/calliopeai/zentinelle' " +
        "target='_blank' style='text-decoration:underline'>zentinelle on GitHub</a> " +
        "→ <code>docker compose up</code> and you're running.</p>",
    },
  },
];
