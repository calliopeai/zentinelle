/**
 * Zentinelle AI as a product of @calliopelabs/ui: the package's Zentinelle
 * brand plus the seven-area navigation model approved on 2026-10-16
 * (docs/design/ui-overhaul-ia.md §4.1). Rows are gated by the capabilities
 * `/auth/me` returns (`view`, `mutate`, `admin`; §4.3): a row with no
 * `requires` is open to every signed-in role.
 */
import {
  defineProduct,
  visibleNav,
  zentinelleBrand,
  type NavArea,
  type NavModel,
} from "@calliopelabs/ui";
import {
  ActivityIcon,
  BarChart3Icon,
  BellIcon,
  BotIcon,
  BrainCircuitIcon,
  ClipboardListIcon,
  FileCheckIcon,
  FileTextIcon,
  HistoryIcon,
  KeyRoundIcon,
  LayoutDashboardIcon,
  LibraryIcon,
  PlugIcon,
  ScaleIcon,
  ScrollTextIcon,
  SettingsIcon,
  ShieldAlertIcon,
  ShieldCheckIcon,
  SirenIcon,
  SparklesIcon,
  UsersIcon,
  WebhookIcon,
} from "lucide-react";

/** The roles of backend/zentinelle/auth/roles.py, as the capabilities each holds. */
export const ROLE_CAPABILITIES = {
  viewer: ["view"],
  operator: ["view", "mutate"],
  admin: ["view", "mutate", "admin"],
} as const;

export type Role = keyof typeof ROLE_CAPABILITIES;

export const ZENTINELLE_NAV: NavModel = [
  {
    key: "overview",
    label: "Overview",
    icon: LayoutDashboardIcon,
    flat: true,
    groups: [
      {
        functions: [
          {
            key: "overview",
            label: "Overview",
            href: "/dashboard",
            icon: LayoutDashboardIcon,
            also: ["/governance"],
          },
        ],
      },
    ],
  },
  {
    key: "agents",
    label: "Agents",
    icon: BotIcon,
    groups: [
      {
        functions: [
          { key: "agents", label: "Agents", href: "/agents", icon: BotIcon },
          {
            key: "groups",
            label: "Groups",
            href: "/agents/groups",
            icon: UsersIcon,
          },
          {
            key: "approvals",
            label: "Approvals",
            href: "/agents/approvals",
            icon: ClipboardListIcon,
          },
        ],
      },
    ],
  },
  {
    key: "policies",
    label: "Policies",
    icon: ShieldCheckIcon,
    groups: [
      {
        functions: [
          {
            key: "policies",
            label: "Policies",
            href: "/policies",
            icon: ShieldCheckIcon,
          },
          {
            key: "content-rules",
            label: "Content rules",
            href: "/content-rules",
            icon: FileCheckIcon,
          },
          {
            key: "prompts",
            label: "Prompt library",
            href: "/system-prompts",
            icon: LibraryIcon,
          },
        ],
      },
    ],
  },
  {
    key: "activity",
    label: "Activity",
    icon: ActivityIcon,
    groups: [
      {
        functions: [
          { key: "alerts", label: "Alerts", href: "/alerts", icon: BellIcon },
          {
            key: "incidents",
            label: "Incidents",
            href: "/incidents",
            icon: SirenIcon,
          },
          {
            key: "events",
            label: "Events",
            href: "/events",
            icon: ActivityIcon,
          },
          {
            key: "audit-log",
            label: "Audit log",
            href: "/audit-logs",
            icon: ScrollTextIcon,
          },
        ],
      },
    ],
  },
  {
    key: "risk",
    label: "Risk & compliance",
    icon: ScaleIcon,
    groups: [
      {
        functions: [
          {
            key: "risks",
            label: "Risks",
            href: "/risks",
            icon: ShieldAlertIcon,
            also: ["/risk"],
          },
          {
            key: "compliance",
            label: "Compliance",
            href: "/compliance",
            icon: ScaleIcon,
          },
          {
            key: "evidence",
            label: "Evidence",
            href: "/evidence",
            icon: FileCheckIcon,
            requires: "admin",
          },
          {
            key: "reports",
            label: "Reports",
            href: "/reports",
            icon: FileTextIcon,
          },
        ],
      },
    ],
  },
  {
    key: "models",
    label: "Models & usage",
    icon: BarChart3Icon,
    groups: [
      {
        functions: [
          {
            key: "usage",
            label: "Usage",
            href: "/usage",
            icon: BarChart3Icon,
          },
          {
            key: "models",
            label: "Models",
            href: "/models",
            icon: BrainCircuitIcon,
          },
          {
            key: "providers",
            label: "Providers",
            href: "/models/providers",
            icon: PlugIcon,
            requires: "admin",
          },
        ],
      },
    ],
  },
  {
    key: "settings",
    label: "Settings",
    icon: SettingsIcon,
    groups: [
      {
        functions: [
          {
            key: "general",
            label: "General",
            href: "/settings",
            icon: SettingsIcon,
            requires: "admin",
          },
          {
            key: "api-keys",
            label: "API keys",
            href: "/settings/api-keys",
            icon: KeyRoundIcon,
            requires: "admin",
          },
          {
            key: "integrations",
            label: "Integrations",
            href: "/settings/astrolift",
            icon: WebhookIcon,
            requires: "admin",
          },
          {
            key: "retention",
            label: "Data retention",
            href: "/settings/retention",
            icon: HistoryIcon,
            requires: "admin",
          },
          {
            key: "assistant",
            label: "Assistant",
            href: "/settings/assistant",
            icon: SparklesIcon,
            requires: "admin",
          },
        ],
      },
    ],
  },
];

export const zentinelle = defineProduct({
  ...zentinelleBrand,
  nav: ZENTINELLE_NAV,
});

/** The navigation a signed-in person may open, from their capabilities. */
export function navFor(capabilities: readonly string[]): NavArea[] {
  return visibleNav(ZENTINELLE_NAV, (c) => capabilities.includes(c));
}
