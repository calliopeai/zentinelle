"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarRail,
  SidebarSeparator,
  useSidebar,
} from "@/components/ui/sidebar";
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
      { title: "Policy Simulator", url: "/policies/simulator", icon: <PlayIcon /> },
      { title: "Policy Analyzer", url: "/policies/analyzer", icon: <SearchCheckIcon /> },
      { title: "Content Rules", url: "/content-rules", icon: <ScanLineIcon /> },
      { title: "Scanner Dashboard", url: "/content-rules/scanner", icon: <ScanSearchIcon /> },
      { title: "Models", url: "/models", icon: <CpuIcon /> },
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
    label: "Risk",
    items: [
      { title: "Risks", url: "/risks", icon: <AlertTriangleIcon /> },
      { title: "Incidents", url: "/incidents", icon: <FlameIcon /> },
      { title: "Compliance", url: "/compliance", icon: <CheckCircleIcon /> },
      { title: "Reports", url: "/compliance/reports", icon: <FileBarChartIcon /> },
    ],
  },
  {
    label: "Library",
    items: [
      {
        title: "System Prompts",
        url: "/system-prompts",
        icon: <BookOpenIcon />,
      },
      { title: "Prompt Builder", url: "/system-prompts/builder", icon: <PenToolIcon /> },
      { title: "Prompt Generator", url: "/system-prompts/generator", icon: <WandIcon /> },
      { title: "Token Calculator", url: "/tools/token-calculator", icon: <CpuIcon /> },
      { title: "Retention", url: "/retention", icon: <ArchiveIcon /> },
      { title: "Network", url: "/network", icon: <NetworkIcon /> },
      { title: "Settings", url: "/settings", icon: <SettingsIcon /> },
    ],
  },
];

type AppSidebarProps = React.ComponentProps<typeof Sidebar> & {
  ssrUser: SessionUser | null;
};

export function AppSidebar({ ssrUser, ...props }: AppSidebarProps) {
  const pathname = usePathname();
  const { state: sidebarState } = useSidebar();

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
