import {
  DataTable,
  PageFrame,
  StatusBadge,
  useUI,
  type Column,
} from "@calliopelabs/ui";
import { CheckCircle2Icon } from "lucide-react";

import type {
  ComplianceCapability,
  ComplianceOverview,
} from "@/graphql/compliance/types";

import { useListController } from "../../patterns/list-controller";
import { ConfigurationNote } from "./ComplianceScreen";
import {
  COMPLIANCE_TABS,
  areaCrumb,
  frameworkHref,
  isAdmin,
  tabsOf,
  type QueryState,
} from "./model";

export interface ComplianceGapsScreenProps extends QueryState {
  capabilities: readonly string[];
  /** `GetComplianceOverview`, the same answer as the Frameworks tab. */
  overview: ComplianceOverview | null;
}

/** One missing capability, with every framework that asks for it. */
export interface Gap {
  id: string;
  name: string;
  capability: ComplianceCapability | null;
  requiredBy: { id: string; name: string }[];
  recommendedBy: { id: string; name: string }[];
}

/** Folds `missingRequired` and `missingRecommended` of every framework into one row per capability. */
export function gapsOf(overview: ComplianceOverview | null): Gap[] {
  if (!overview) return [];
  const all = [
    ...overview.observeCapabilities,
    ...overview.controlCapabilities,
  ];
  const gaps = new Map<string, Gap>();
  const gap = (id: string) => {
    let row = gaps.get(id);
    if (!row) {
      const capability = all.find((c) => c.id === id) ?? null;
      row = {
        id,
        name: capability?.name ?? id,
        capability,
        requiredBy: [],
        recommendedBy: [],
      };
      gaps.set(id, row);
    }
    return row;
  };
  for (const f of overview.frameworkCoverage) {
    const framework = { id: f.id ?? "", name: f.name ?? f.id ?? "" };
    for (const id of f.missingRequired) gap(id).requiredBy.push(framework);
    for (const id of f.missingRecommended)
      gap(id).recommendedBy.push(framework);
  }
  // Required gaps first, the widest first: closing one closes the most.
  return [...gaps.values()].sort(
    (a, b) =>
      b.requiredBy.length - a.requiredBy.length ||
      b.recommendedBy.length - a.recommendedBy.length ||
      a.name.localeCompare(b.name),
  );
}

function Frameworks({ items }: { items: { id: string; name: string }[] }) {
  const { Link } = useUI();
  if (!items.length) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="flex flex-wrap gap-x-2 gap-y-1">
      {items.map((f) => (
        <Link
          key={f.id}
          href={frameworkHref(f.id)}
          className="relative z-10 underline-offset-2 hover:underline"
        >
          {f.name}
        </Link>
      ))}
    </span>
  );
}

/**
 * Compliance > Gaps: the capabilities no policy or rule configures yet, one
 * row each, with the frameworks that need them, the widest gaps first.
 */
export function ComplianceGapsScreen({
  capabilities,
  overview,
  loading,
  error,
  onRetry,
}: ComplianceGapsScreenProps) {
  const gaps = gapsOf(overview);
  const controller = useListController(gaps, {
    loading,
    error,
    retry: onRetry,
  });
  const columns: Column<Gap>[] = [
    {
      id: "capability",
      header: "Capability",
      cell: (g) => (
        <span className="flex min-w-0 flex-col">
          <span className="truncate font-medium">{g.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {g.capability?.capabilityType === "control" ? "Control" : "Observe"}
            {g.capability?.supportingPolicies.length
              ? ` · ${g.capability.supportingPolicies.join(", ")}`
              : ""}
          </span>
        </span>
      ),
    },
    {
      id: "weight",
      header: "Gap",
      width: "w-32",
      cell: (g) =>
        g.requiredBy.length ? (
          <StatusBadge tone="warn">Required</StatusBadge>
        ) : (
          <StatusBadge tone="muted">Recommended</StatusBadge>
        ),
    },
    {
      id: "required",
      header: "Required by",
      cell: (g) => <Frameworks items={g.requiredBy} />,
      cellClassName: "whitespace-normal",
    },
    {
      id: "recommended",
      header: "Recommended by",
      cell: (g) => <Frameworks items={g.recommendedBy} />,
      cellClassName: "whitespace-normal",
    },
  ];
  return (
    <PageFrame
      crumbs={[areaCrumb("compliance", capabilities)]}
      title="Compliance"
      tabs={tabsOf(COMPLIANCE_TABS, "gaps")}
      tabsLabel="Compliance"
      description={<ConfigurationNote admin={isAdmin(capabilities)} />}
    >
      <DataTable
        label="Gaps"
        controller={controller}
        columns={columns}
        getRowId={(g) => g.id}
        rowLabel={(g) => g.name}
        empty={{
          icon: (
            <CheckCircle2Icon className="size-5 text-success" aria-hidden />
          ),
          title: "No gaps",
          description:
            "Every capability the tracked frameworks ask for is configured.",
        }}
      />
    </PageFrame>
  );
}
