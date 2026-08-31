"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import { BotIcon, ChevronLeftIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { useAgentBySlug } from "./use-agent";

const TABS = [
  { slug: "activity", label: "Activity" },
  { slug: "interactions", label: "Interactions" },
  { slug: "usage", label: "Usage" },
  { slug: "compliance", label: "Compliance" },
] as const;

function healthVariant(health: string | null | undefined) {
  switch (health) {
    case "healthy":
      return "default" as const;
    case "degraded":
      return "secondary" as const;
    case "unhealthy":
      return "destructive" as const;
    default:
      return "outline" as const;
  }
}

export default function AgentLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = use(params);
  const pathname = usePathname();
  const { agent, loading, notFound } = useAgentBySlug(agentId);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col gap-3">
        <Link
          href="/agents"
          className="text-muted-foreground hover:text-foreground flex w-fit items-center gap-1 text-sm"
        >
          <ChevronLeftIcon className="size-4" />
          All agents
        </Link>

        <div className="flex items-center gap-3">
          <BotIcon className="text-muted-foreground size-6" />
          <div className="flex flex-col">
            {loading ? (
              <Skeleton className="h-7 w-56" />
            ) : (
              <h1 className="text-2xl font-semibold tracking-tight">
                {agent?.name ?? agentId}
              </h1>
            )}
            <code className="text-muted-foreground text-xs">{agentId}</code>
          </div>
          {agent ? (
            <div className="flex gap-2">
              <Badge variant="outline">{agent.status}</Badge>
              <Badge variant={healthVariant(agent.health)}>{agent.health}</Badge>
            </div>
          ) : null}
        </div>
      </div>

      {notFound ? (
        <div className="border-destructive/40 bg-destructive/5 rounded-lg border p-6">
          <p className="font-medium">Agent not found</p>
          <p className="text-muted-foreground mt-1 text-sm">
            No agent with id <code>{agentId}</code> exists in this tenant. If it
            was deployed from Astrolift, confirm the deployment slug matches.
          </p>
        </div>
      ) : (
        <>
          <nav className="flex gap-1 border-b">
            {TABS.map((tab) => {
              const href = `/agents/${agentId}/${tab.slug}`;
              const active = pathname === href;
              return (
                <Link
                  key={tab.slug}
                  href={href}
                  className={
                    active
                      ? "border-primary text-foreground -mb-px border-b-2 px-4 py-2 text-sm font-medium"
                      : "text-muted-foreground hover:text-foreground -mb-px border-b-2 border-transparent px-4 py-2 text-sm"
                  }
                >
                  {tab.label}
                </Link>
              );
            })}
          </nav>
          {children}
        </>
      )}
    </div>
  );
}
