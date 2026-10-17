import {
  DataTable,
  Section,
  StatusBadge,
  type Column,
  type StatusTone,
  type TableController,
} from "@calliopelabs/ui";
import { ShieldCheckIcon } from "lucide-react";

import { Card } from "../../shared/Card";
import { toneOf, words } from "./format";

/** GET /effective-policy?endpoint= (backend/zentinelle/api/views), as the tab reads it. */
export interface EffectivePolicyRow {
  id: string;
  name: string;
  type: string;
  scope: string;
  priority: number;
  enforcement: string;
}

export interface ToolPermissions {
  allowed: string[];
  denied: string[];
  requires_approval: string[];
}

/** Policy.Enforcement. */
/** Long names wrap inside a bounded column instead of widening the table. */
const WRAP = "min-w-40 max-w-md whitespace-normal";

const ENFORCEMENT_TONE: Record<string, StatusTone> = {
  enforce: "ok",
  audit: "info",
  disabled: "muted",
};

const COLUMNS: Column<EffectivePolicyRow>[] = [
  {
    id: "name",
    cellClassName: WRAP,
    header: "Policy",
    cell: (p) => (
      <span className="flex min-w-0 flex-col">
        <span className="font-medium [overflow-wrap:anywhere]">{p.name}</span>
        <span className="text-muted-foreground text-xs">{words(p.type)}</span>
      </span>
    ),
  },
  { id: "scope", header: "Set at", cell: (p) => words(p.scope) },
  {
    id: "priority",
    header: "Priority",
    align: "right",
    width: "w-24",
    cell: (p) => <span className="font-mono tabular-nums">{p.priority}</span>,
  },
  {
    id: "enforcement",
    header: "Enforcement",
    width: "w-32",
    cell: (p) => (
      <StatusBadge tone={toneOf(ENFORCEMENT_TONE, p.enforcement)}>
        {words(p.enforcement)}
      </StatusBadge>
    ),
  },
];

function Tools({ title, tools }: { title: string; tools: string[] }) {
  return (
    <Card title={title}>
      {tools.length ? (
        <ul className="flex flex-wrap gap-1">
          {tools.map((tool) => (
            <li
              key={tool}
              className="bg-muted rounded-lg px-2 py-0.5 font-mono text-xs [overflow-wrap:anywhere]"
            >
              {tool}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">None</p>
      )}
    </Card>
  );
}

export interface AgentPoliciesTabProps {
  /** The policies in effect for this agent, in resolution order. */
  table: TableController<EffectivePolicyRow>;
  /** The resolved tool permissions; null until the answer lands. */
  tools: ToolPermissions | null;
  /** Policies, Effective, opened on this agent. */
  effectiveHref: string;
}

/** Policies (new): what is in effect for this agent, from every scope above it, and the tools that leaves it. */
export function AgentPoliciesTab({
  table,
  tools,
  effectiveHref,
}: AgentPoliciesTabProps) {
  return (
    <>
      <DataTable
        label="Policies in effect"
        controller={table}
        columns={COLUMNS}
        getRowId={(p) => p.id}
        rowHref={(p) => `/policies/${encodeURIComponent(p.id)}`}
        rowLabel={(p) => `policy ${p.name}`}
        empty={{
          icon: <ShieldCheckIcon />,
          title: "No policies apply",
          description:
            "Nothing at the organization, group, deployment or agent scope targets this agent.",
          actionHref: "/policies/create",
          actionLabel: "New policy",
          learnMoreHref: effectiveHref,
          learnMoreLabel: "How policies resolve",
        }}
      />
      {tools && (
        <Section
          title="Tool permissions"
          description="The result of every policy above, for this agent."
        >
          <div className="grid gap-4 md:grid-cols-3">
            <Tools title="Allowed" tools={tools.allowed} />
            <Tools title="Need approval" tools={tools.requires_approval} />
            <Tools title="Denied" tools={tools.denied} />
          </div>
        </Section>
      )}
    </>
  );
}
