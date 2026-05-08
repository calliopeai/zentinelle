"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ChevronRightIcon } from "lucide-react";
import { useComplianceAlerts } from "@/graphql/alerts/hooks";
import { ThemeToggle } from "@/components/ThemeToggle";
import { NavUser } from "@/components/NavUser";
import type { SessionUser } from "@/lib/auth/session";
import {
  LayoutDashboardIcon,
  ShieldIcon,
  FileTextIcon,
  ScanLineIcon,
  ActivityIcon,
  ScrollTextIcon,
  BarChart3Icon,
  AlertTriangleIcon,
  BellIcon,
  FlameIcon,
  CheckCircleIcon,
  BookOpenIcon,
  SettingsIcon,
  PlayIcon,
  SearchCheckIcon,
  SearchIcon,
  CpuIcon,
  NetworkIcon,
  ArchiveIcon,
  KeyIcon,
  UsersIcon,
  PenToolIcon,
  WandIcon,
  ScanSearchIcon,
  FileBarChartIcon,
  SparklesIcon,
  LayersIcon,
  UploadIcon,
} from "lucide-react";

interface NavItem {
  title: string;
  url: string;
  icon: React.ReactNode;
}

interface NavSection {
  label?: string;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    items: [
      {
        title: "Dashboard",
        url: "/dashboard",
        icon: <LayoutDashboardIcon />,
      },
    ],
  },
  {
    label: "Governance",
    items: [
      { title: "Agents", url: "/agents", icon: <ShieldIcon /> },
      { title: "Policies", url: "/policies", icon: <FileTextIcon /> },
      { title: "Policy Hierarchy", url: "/policies/hierarchy", icon: <LayersIcon /> },
      { title: "Effective Policy", url: "/policies/effective", icon: <SearchIcon /> },
      { title: "Policy Simulator", url: "/policies/simulator", icon: <PlayIcon /> },
      { title: "Policy Analyzer", url: "/policies/analyzer", icon: <SearchCheckIcon /> },
      { title: "Policy Import", url: "/policies/import", icon: <UploadIcon /> },
      { title: "Content Rules", url: "/content-rules", icon: <ScanLineIcon /> },
      { title: "Scanner Dashboard", url: "/content-rules/scanner", icon: <ScanSearchIcon /> },
      { title: "Models", url: "/models", icon: <CpuIcon /> },
      { title: "Model Compare", url: "/models/compare", icon: <BarChart3Icon /> },
    ],
  },
  {
    label: "Risk",
    items: [
      { title: "Overview", url: "/risks/overview", icon: <BarChart3Icon /> },
      { title: "Register", url: "/risks", icon: <AlertTriangleIcon /> },
      { title: "FMEA Analysis", url: "/risks/fmea", icon: <SearchCheckIcon /> },
      { title: "Alerts", url: "/alerts", icon: <BellIcon /> },
      { title: "Incidents", url: "/incidents", icon: <FlameIcon /> },
      { title: "Reports", url: "/risks/reports", icon: <FileBarChartIcon /> },
    ],
  },
  {
    label: "Compliance",
    items: [
      { title: "Overview", url: "/compliance", icon: <CheckCircleIcon /> },
      { title: "Frameworks", url: "/compliance/frameworks", icon: <ShieldIcon /> },
      { title: "Gap Analysis", url: "/compliance/gaps", icon: <SearchCheckIcon /> },
      { title: "Reports", url: "/compliance/reports", icon: <FileBarChartIcon /> },
    ],
  },
  {
    label: "Observability",
    items: [
      { title: "Events", url: "/events", icon: <ActivityIcon /> },
      { title: "Audit Logs", url: "/audit-logs", icon: <ScrollTextIcon /> },
      { title: "Monitoring", url: "/monitoring", icon: <BarChart3Icon /> },
      { title: "Anomalies", url: "/observability/anomalies", icon: <AlertTriangleIcon /> },
    ],
  },
  {
    label: "Tools",
    items: [
      { title: "System Prompts", url: "/system-prompts", icon: <BookOpenIcon /> },
      { title: "Prompt Builder", url: "/system-prompts/builder", icon: <PenToolIcon /> },
      { title: "Prompt Generator", url: "/system-prompts/generator", icon: <WandIcon /> },
      { title: "AI Assistant", url: "/assistant", icon: <SparklesIcon /> },
      { title: "Token Calculator", url: "/tools/token-calculator", icon: <CpuIcon /> },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "General", url: "/settings", icon: <SettingsIcon /> },
      { title: "API Keys", url: "/settings/api-keys", icon: <KeyIcon /> },
      { title: "LLM Providers", url: "/settings/llm-providers", icon: <SparklesIcon /> },
      { title: "Network Policies", url: "/network", icon: <NetworkIcon /> },
      { title: "Data Retention", url: "/retention", icon: <ArchiveIcon /> },
    ],
  },
];

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  ssrUser: SessionUser | null;
};

const STORAGE_KEY = "zentinelle.sidebar.sections";

export function AppSidebar({ ssrUser, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();
  const { alerts: openAlerts } = useComplianceAlerts({ status: "open" });
  const openAlertCount = openAlerts.length;

  const [openSections, setOpenSections] = React.useState<Record<string, boolean>>(
    {},
  );

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setOpenSections(JSON.parse(raw));
    } catch {
      // ignore
    }
  }, []);

  const toggleSection = React.useCallback(
    (label: string, open: boolean) => {
      setOpenSections((prev) => {
        const next = { ...prev, [label]: open };
        try {
          window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        } catch {
          // ignore
        }
        return next;
      });
    },
    [],
  );

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <div className="flex items-center gap-1">
              <SidebarMenuButton size="lg" asChild className="flex-1">
                <a href="/dashboard">
                  {sidebarState === "collapsed" ? (
                    <img src="/logo-icon.svg" alt="Zentinelle" className="size-8 shrink-0" />
                  ) : (
                    <img src="/logo.svg" alt="Zentinelle" className="h-8 w-auto" />
                  )}
                </a>
              </SidebarMenuButton>
              <SidebarTrigger
                className="size-7 shrink-0 group-data-[collapsible=icon]:hidden"
                aria-label="Collapse sidebar"
              />
            </div>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section, sectionIdx) => {
          const sectionItems = (
            <SidebarMenu>
              {section.items.map((item) => {
                const isActive =
                  pathname === item.url ||
                  pathname.startsWith(item.url + "/");
                const showAlertBadge =
                  item.url === "/alerts" && openAlertCount > 0;
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      isActive={isActive}
                      tooltip={item.title}
                    >
                      <a href={item.url}>
                        {item.icon}
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                    {showAlertBadge && (
                      <SidebarMenuBadge className="bg-red-500/15 text-red-600 dark:text-red-400">
                        {openAlertCount > 99 ? "99+" : openAlertCount}
                      </SidebarMenuBadge>
                    )}
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          );

          // Unlabeled sections (Dashboard) render flat — no collapse
          if (!section.label) {
            return (
              <SidebarGroup key={sectionIdx}>{sectionItems}</SidebarGroup>
            );
          }

          // Auto-open the section containing the active route
          const containsActive = section.items.some(
            (item) =>
              pathname === item.url || pathname.startsWith(item.url + "/"),
          );
          const sectionOpen =
            openSections[section.label] ?? (containsActive || true);

          return (
            <Collapsible
              key={section.label}
              open={sectionOpen}
              onOpenChange={(open) => toggleSection(section.label!, open)}
              className="group/collapsible"
            >
              <SidebarGroup>
                <CollapsibleTrigger asChild>
                  <SidebarGroupLabel className="group/label cursor-pointer flex items-center justify-between hover:text-sidebar-foreground transition-colors">
                    <span>{section.label}</span>
                    <ChevronRightIcon className="size-3 transition-transform group-data-[state=open]/collapsible:rotate-90" />
                  </SidebarGroupLabel>
                </CollapsibleTrigger>
                <CollapsibleContent>{sectionItems}</CollapsibleContent>
              </SidebarGroup>
            </Collapsible>
          );
        })}
      </SidebarContent>
      <SidebarFooter>
        <ThemeToggle />
        <SidebarSeparator />
        <NavUser ssrUser={ssrUser} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
