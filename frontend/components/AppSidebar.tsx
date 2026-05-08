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
  useSidebar,
} from "@/components/ui/sidebar";
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
  HistoryIcon,
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
      { title: "Policy Simulator", url: "/policies/simulator", icon: <PlayIcon /> },
      { title: "Policy Analyzer", url: "/policies/analyzer", icon: <SearchCheckIcon /> },
      { title: "Content Rules", url: "/content-rules", icon: <ScanLineIcon /> },
      { title: "Scanner Dashboard", url: "/content-rules/scanner", icon: <ScanSearchIcon /> },
      { title: "Models", url: "/models", icon: <CpuIcon /> },
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
      { title: "Reports", url: "/compliance/reports", icon: <FileBarChartIcon /> },
    ],
  },
  {
    label: "Observability",
    items: [
      { title: "Events", url: "/events", icon: <ActivityIcon /> },
      { title: "Audit Logs", url: "/audit-logs", icon: <ScrollTextIcon /> },
      { title: "Monitoring", url: "/monitoring", icon: <BarChart3Icon /> },
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

export function AppSidebar({ ssrUser, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();
  const { alerts: openAlerts } = useComplianceAlerts({ status: "open" });
  const openAlertCount = openAlerts.length;

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <a href="/dashboard">
                {sidebarState === "collapsed" ? (
                  <img src="/logo-icon.svg" alt="Zentinelle" className="size-8 shrink-0" />
                ) : (
                  <img src="/logo.svg" alt="Zentinelle" className="h-8 w-auto" />
                )}
              </a>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {sections.map((section, sectionIdx) => (
          <SidebarGroup key={section.label ?? sectionIdx}>
            {section.label && (
              <SidebarGroupLabel>{section.label}</SidebarGroupLabel>
            )}
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
          </SidebarGroup>
        ))}
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
