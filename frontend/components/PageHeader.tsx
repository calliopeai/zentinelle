"use client";

import { usePathname } from "next/navigation";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { HelpCircleIcon } from "lucide-react";
import { routeLabels } from "@/lib/routes";

const toLabel = (segment: string) =>
  routeLabels[segment] ?? segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, " ");

/**
 * Map portal route prefixes to wiki anchors.
 * Returns the URL of the most relevant docs page for the current route.
 */
function helpUrlFor(pathname: string): string {
  const wiki = "https://github.com/calliopeai/zentinelle/wiki";
  if (pathname.startsWith("/policies")) return `${wiki}/Policy-Reference`;
  if (pathname.startsWith("/risks")) return `${wiki}/Policy-Reference#fmea-risk-priority`;
  if (pathname.startsWith("/compliance")) return `${wiki}/Compliance-Frameworks`;
  if (pathname.startsWith("/agents")) return `${wiki}/SDK-Guide`;
  if (pathname.startsWith("/audit")) return `${wiki}/API-Reference#audit-chain`;
  if (pathname.startsWith("/events") || pathname.startsWith("/monitoring"))
    return `${wiki}/API-Reference#events`;
  if (pathname.startsWith("/settings/llm-providers"))
    return `${wiki}/Deployment-Guide#llm-providers`;
  if (pathname.startsWith("/settings")) return `${wiki}/Deployment-Guide`;
  if (pathname.startsWith("/assistant")) return `${wiki}/API-Reference#ai-assistant-endpoints`;
  return wiki;
}

export const PageHeader = () => {
  const pathname = usePathname();

  const segments = pathname.split("/").filter(Boolean);

  const crumbs = segments.map((segment, i) => ({
    label: toLabel(segment),
    href: "/" + segments.slice(0, i + 1).join("/"),
    isLast: i === segments.length - 1,
  }));

  const helpUrl = helpUrlFor(pathname);

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
      <div className="flex items-center gap-2 px-4">
        <SidebarTrigger className="-ml-1" />
        <Separator
          orientation="vertical"
          className="mr-2 data-vertical:h-4 data-vertical:self-auto"
        />
        <Breadcrumb>
          <BreadcrumbList>
            {crumbs.map((crumb, i) => (
              <span key={crumb.href} className="flex items-center gap-1.5">
                {i > 0 && <BreadcrumbSeparator />}
                <BreadcrumbItem>
                  {crumb.isLast ? (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  ) : (
                    <BreadcrumbLink href={crumb.href}>{crumb.label}</BreadcrumbLink>
                  )}
                </BreadcrumbItem>
              </span>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      </div>
      <div className="flex items-center gap-1 px-4">
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-foreground"
        >
          <a
            href={helpUrl}
            target="_blank"
            rel="noopener noreferrer"
            title="Open relevant docs"
          >
            <HelpCircleIcon className="size-4" />
            <span className="hidden md:inline ml-1.5 text-xs">Docs</span>
          </a>
        </Button>
      </div>
    </header>
  );
};
