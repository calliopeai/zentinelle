"use client";

/**
 * Risk & compliance wired to the operations the app already sends: the
 * risk register and stats, the compliance overview, packs and reports
 * (GraphQL), and the REST reads of the area (risk trend, control evidence,
 * MITRE ATLAS, BROCS, report jobs). Each container maps the answer onto its
 * pure screen; the routes under app/ render these. Navigation after a write
 * is the route's (`onNavigate`).
 */
import { useMutation } from "@apollo/client/react";
import { useTranslations } from "next-intl";
import * as React from "react";
import { toast } from "sonner";

import { useComplianceOverview } from "@/graphql/compliance/hooks";
import {
  ACTIVATE_COMPLIANCE_PACK,
  RUN_COMPLIANCE_CHECK,
} from "@/graphql/compliance/mutations";
import {
  GET_COMPLIANCE_OVERVIEW,
  LIST_COMPLIANCE_PACKS,
} from "@/graphql/compliance/queries";
import { useComplianceReports } from "@/graphql/compliance-reports/hooks";
import { GENERATE_COMPLIANCE_REPORT } from "@/graphql/compliance-reports/mutations";
import { GET_COMPLIANCE_REPORTS } from "@/graphql/compliance-reports/queries";
import { useRisk, useRisks, useRiskStats } from "@/graphql/risks/hooks";
import {
  CREATE_RISK,
  DELETE_RISK,
  REVIEW_RISK,
  UPDATE_RISK,
} from "@/graphql/risks/mutations";
import { GET_RISK, GET_RISKS, GET_RISK_STATS } from "@/graphql/risks/queries";
import type { CreateRiskInput, RiskListVariables } from "@/graphql/risks/types";
import { authenticatedFetch } from "@/lib/auth/fetch";

import { payloadOrThrow } from "../../shared/mutation";
import { AtlasScreen } from "./AtlasScreen";
import { BrocsScreen } from "./BrocsScreen";
import { ComplianceGapsScreen } from "./ComplianceGapsScreen";
import { ComplianceScreen } from "./ComplianceScreen";
import {
  CompliancePacksDialog,
  type CompliancePack,
} from "./components/CompliancePacksDialog";
import {
  GenerateReportDialog,
  type ReportRequest,
} from "./components/GenerateReportDialog";
import { EvidenceCoverageScreen } from "./EvidenceCoverageScreen";
import { FrameworkDetailScreen } from "./FrameworkDetailScreen";
import {
  ReportsScreen,
  fromComplianceReport,
  fromReportJob,
  type ReportsView,
} from "./ReportsScreen";
import type {
  AtlasResponse,
  BrocsResponse,
  ControlEvidenceResponse,
  ReportJob,
  RiskTrendResponse,
} from "./rest-types";
import { RiskDetailScreen } from "./RiskDetailScreen";
import { RiskFormScreen } from "./RiskFormScreen";
import { RisksOverviewScreen } from "./RisksOverviewScreen";
import { RisksScreen, type RegisterView } from "./RisksScreen";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/zentinelle/v1";

async function rest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(`${API_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
  const body = (await response.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!response.ok) {
    const message = body.detail ?? body.error;
    throw new Error(typeof message === "string" ? message : "");
  }
  return body as T;
}

/** The area's REST reads and the report jobs; stories pass their own. */
export interface RiskRestClient {
  trend: (days: number) => Promise<RiskTrendResponse>;
  evidence: () => Promise<ControlEvidenceResponse>;
  atlas: () => Promise<AtlasResponse>;
  brocs: () => Promise<BrocsResponse>;
  createJob: (body: {
    report_type: ReportJob["report_type"];
    format: ReportJob["format"];
    params: Record<string, unknown>;
  }) => Promise<ReportJob>;
  job: (id: number) => Promise<ReportJob>;
}

export const riskRest: RiskRestClient = {
  trend: (days) => rest(`/risks/trend?days=${days}`),
  evidence: () => rest("/evidence/controls"),
  atlas: () => rest("/threats/atlas"),
  brocs: () => rest("/controls/brocs"),
  createJob: (body) =>
    rest("/reports/", { method: "POST", body: JSON.stringify(body) }),
  job: (id) => rest(`/reports/${id}/`),
};

/** A REST read with retry; `null` key skips it. */
function useRest<T>(load: () => Promise<T>, key: string | null) {
  const [result, setResult] = React.useState<{
    key: string;
    value?: T;
    error?: Error;
  } | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  React.useEffect(() => {
    if (key === null) return;
    let live = true;
    load().then(
      (value) => live && setResult({ key, value }),
      (error: unknown) =>
        live &&
        setResult({
          key,
          error: error instanceof Error ? error : new Error(String(error)),
        }),
    );
    return () => {
      live = false;
    };
    // `load` is rebuilt every render; `key` names what it loads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);
  const current = key !== null && result?.key === key ? result : null;
  return {
    loading: key !== null && !current,
    value: current?.value,
    error: current?.error ?? null,
    retry: () => {
      setResult(null);
      setAttempt((n) => n + 1);
    },
  };
}

/** The error, worded by `fallback` when the server said nothing. */
function worded(error: Error | null, fallback: string) {
  return error && !error.message ? new Error(fallback) : error;
}

type Payload = {
  success?: boolean | null;
  error?: string | null;
  errors?: readonly string[] | null;
};

function useRiskWrites() {
  const t = useTranslations("risk.connected");
  const refetchQueries = [GET_RISKS, GET_RISK_STATS];
  const [review] = useMutation<{ reviewRisk: Payload }>(REVIEW_RISK, {
    refetchQueries: [...refetchQueries, GET_RISK],
  });
  const [remove] = useMutation<{ deleteRisk: Payload }>(DELETE_RISK, {
    refetchQueries,
  });
  return {
    review: async (id: string) => {
      try {
        const { data } = await review({ variables: { id } });
        payloadOrThrow(data?.reviewRisk, t("notReviewed"));
      } catch (e) {
        toast.error(
          e instanceof Error && e.message ? e.message : t("notReviewed"),
        );
      }
    },
    remove: async (id: string) => {
      const { data } = await remove({ variables: { id } });
      payloadOrThrow(data?.deleteRisk, t("notDeleted"));
    },
  };
}

export interface RisksConnectedProps {
  capabilities: readonly string[];
  /** `?view=`: list, matrix, or `rpn` (the FMEA ranking). */
  view: RegisterView;
}

/** `/risks`: `GetRisks` with the register's filters; the RPN view ranks by score. */
export function RisksConnected({ capabilities, view }: RisksConnectedProps) {
  const [filters, setFilters] = React.useState<RiskListVariables>({});
  const { risks, loading, error, refetch } = useRisks(filters);
  const writes = useRiskWrites();
  const shown = React.useMemo(
    () =>
      view === "rpn"
        ? [...risks].sort((a, b) => (b.riskScore ?? 0) - (a.riskScore ?? 0))
        : risks,
    [risks, view],
  );
  return (
    <div data-tour="risk-overview" className="min-w-0">
      <RisksScreen
        capabilities={capabilities}
        view={view}
        risks={shown}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        filters={filters}
        onFiltersChange={setFilters}
        onReview={(risk) => void writes.review(risk.id)}
        onDelete={(risk) =>
          void writes
            .remove(risk.id)
            .catch((e: unknown) =>
              toast.error(e instanceof Error ? e.message : String(e)),
            )
        }
      />
    </div>
  );
}

export interface RiskDetailConnectedProps {
  capabilities: readonly string[];
  id: string;
  /** `?edit=1`: the risk in its form. */
  editing: boolean;
  onNavigate?: (href: string) => void;
}

/** `/risks/{id}`: `GetRisk`, Review and Delete; with `?edit=1`, the form on `UpdateRisk`. */
export function RiskDetailConnected({
  capabilities,
  id,
  editing,
  onNavigate,
}: RiskDetailConnectedProps) {
  const { risk, loading, error, refetch } = useRisk(id);
  const writes = useRiskWrites();
  const [reviewing, setReviewing] = React.useState(false);
  const save = useRiskSave(id);
  if (editing && risk)
    return (
      <RiskFormScreen
        capabilities={capabilities}
        risk={risk}
        onSubmit={async (input) => {
          const errors = await save(input);
          if (!errors.length) onNavigate?.(`/risks/${encodeURIComponent(id)}`);
          return errors;
        }}
      />
    );
  return (
    <RiskDetailScreen
      capabilities={capabilities}
      risk={risk}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      reviewing={reviewing}
      onReview={async () => {
        setReviewing(true);
        await writes.review(id);
        setReviewing(false);
      }}
      onDelete={async () => {
        await writes.remove(id);
        onNavigate?.("/risks");
      }}
    />
  );
}

/** CreateRisk, or UpdateRisk when `id` is given; resolves with the server's errors. */
function useRiskSave(id?: string) {
  const t = useTranslations("risk.connected");
  const refetchQueries = [GET_RISKS, GET_RISK_STATS, GET_RISK];
  const [create] = useMutation<{
    createRisk: Payload & { riskId: string | null };
  }>(CREATE_RISK, { refetchQueries });
  const [update] = useMutation<{ updateRisk: Payload }>(UPDATE_RISK, {
    refetchQueries,
  });
  return async (input: CreateRiskInput): Promise<string[]> => {
    try {
      if (id) {
        const { data } = await update({ variables: { id, input } });
        payloadOrThrow(data?.updateRisk, t("notSaved"));
        return [];
      }
      const { data } = await create({ variables: { input } });
      const payload = payloadOrThrow(data?.createRisk, t("notCreated"));
      return payload.riskId ? [] : [t("notCreated")];
    } catch (e) {
      return [e instanceof Error && e.message ? e.message : t("notSaved")];
    }
  };
}

/** `/risks/create`: the form on `CreateRisk`; the register after a save. */
export function RiskCreateConnected({
  capabilities,
  onNavigate,
}: {
  capabilities: readonly string[];
  onNavigate?: (href: string) => void;
}) {
  const save = useRiskSave();
  return (
    <RiskFormScreen
      capabilities={capabilities}
      onSubmit={async (input) => {
        const errors = await save(input);
        if (!errors.length) onNavigate?.("/risks");
        return errors;
      }}
    />
  );
}

/** `/risks/overview`: `GetRiskStats`, and REST `risks/trend?days=30` on its own. */
export function RisksOverviewConnected({
  capabilities,
  client = riskRest,
}: {
  capabilities: readonly string[];
  client?: RiskRestClient;
}) {
  const t = useTranslations("risk.connected");
  const { stats, loading, error, refetch } = useRiskStats();
  const trend = useRest(() => client.trend(30), "trend");
  return (
    <RisksOverviewScreen
      capabilities={capabilities}
      stats={stats ?? null}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      trend={trend.value?.trend ?? []}
      trendState={{
        loading: trend.loading,
        error: worded(trend.error, t("trendFailed")),
        onRetry: trend.retry,
      }}
    />
  );
}

/** `/compliance`: `GetComplianceOverview`, Run check, and the packs dialog. */
export function ComplianceConnected({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  const t = useTranslations("risk.connected");
  const { overview, loading, error, refetch } = useComplianceOverview();
  const [runCheck, check] = useMutation<{ runComplianceCheck: Payload }>(
    RUN_COMPLIANCE_CHECK,
    { refetchQueries: [GET_COMPLIANCE_OVERVIEW] },
  );
  const [listPacks, packsState] = useMutation<{
    listCompliancePacks: { success: boolean | null; packs: CompliancePack[] };
  }>(LIST_COMPLIANCE_PACKS);
  const [activate] = useMutation<{ activateCompliancePack: Payload }>(
    ACTIVATE_COMPLIANCE_PACK,
    { refetchQueries: [GET_COMPLIANCE_OVERVIEW] },
  );
  const [packsOpen, setPacksOpen] = React.useState(false);
  const packs = packsState.data?.listCompliancePacks.packs ?? [];
  return (
    <div data-tour="compliance-frameworks" className="min-w-0">
      <ComplianceScreen
        capabilities={capabilities}
        overview={overview}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
        checking={check.loading}
        onRunCheck={async () => {
          try {
            const { data } = await runCheck();
            payloadOrThrow(data?.runComplianceCheck, t("checkFailed"));
          } catch (e) {
            toast.error(
              e instanceof Error && e.message ? e.message : t("checkFailed"),
            );
          }
        }}
        onOpenPacks={() => {
          setPacksOpen(true);
          if (!packsState.called) void listPacks();
        }}
      />
      <CompliancePacksDialog
        open={packsOpen}
        onOpenChange={setPacksOpen}
        packs={packs}
        loading={packsState.loading}
        error={packsState.error ?? null}
        onRetry={() => void listPacks()}
        onActivate={async (pack) => {
          try {
            const { data } = await activate({
              variables: { packId: pack.name },
            });
            payloadOrThrow(data?.activateCompliancePack, t("packFailed"));
          } catch (e) {
            return e instanceof Error && e.message
              ? e.message
              : t("packFailed");
          }
        }}
      />
    </div>
  );
}

/** `/compliance/{framework}`: the framework's `frameworkCoverage` row; old slugs match without case. */
export function FrameworkDetailConnected({
  capabilities,
  frameworkId,
  onNavigate,
}: {
  capabilities: readonly string[];
  frameworkId: string;
  onNavigate?: (href: string) => void;
}) {
  const { overview, loading, error, refetch } = useComplianceOverview();
  const id =
    overview?.frameworkCoverage.find(
      (f) =>
        f.id?.toLowerCase() === frameworkId.toLowerCase().replace(/-/g, "_") ||
        f.id?.toLowerCase() === frameworkId.toLowerCase(),
    )?.id ?? frameworkId;
  return (
    <FrameworkDetailScreen
      capabilities={capabilities}
      frameworkId={id}
      overview={overview}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
      onGenerateReport={() =>
        onNavigate?.(
          `/reports?type=compliance&framework=${encodeURIComponent(id)}`,
        )
      }
    />
  );
}

/** `/compliance/gaps`: the same `GetComplianceOverview`, by what is missing. */
export function ComplianceGapsConnected({
  capabilities,
}: {
  capabilities: readonly string[];
}) {
  const { overview, loading, error, refetch } = useComplianceOverview();
  return (
    <ComplianceGapsScreen
      capabilities={capabilities}
      overview={overview}
      loading={loading}
      error={error}
      onRetry={() => void refetch()}
    />
  );
}

function useEvidence<T>(load: () => Promise<T>, key: string, fallback: string) {
  const read = useRest(load, key);
  return {
    value: read.value ?? null,
    loading: read.loading,
    error: worded(read.error, fallback),
    onRetry: read.retry,
  };
}

/** `/evidence`: REST `evidence/controls`. */
export function EvidenceCoverageConnected({
  capabilities,
  client = riskRest,
}: {
  capabilities: readonly string[];
  client?: RiskRestClient;
}) {
  const t = useTranslations("risk.connected");
  const read = useEvidence(client.evidence, "evidence", t("evidenceFailed"));
  return (
    <EvidenceCoverageScreen
      capabilities={capabilities}
      evidence={read.value}
      loading={read.loading}
      error={read.error}
      onRetry={read.onRetry}
      onRefresh={read.onRetry}
    />
  );
}

/** `/evidence/atlas`: REST `threats/atlas`. */
export function AtlasConnected({
  capabilities,
  client = riskRest,
}: {
  capabilities: readonly string[];
  client?: RiskRestClient;
}) {
  const t = useTranslations("risk.connected");
  const read = useEvidence(client.atlas, "atlas", t("evidenceFailed"));
  return (
    <AtlasScreen
      capabilities={capabilities}
      atlas={read.value}
      loading={read.loading}
      error={read.error}
      onRetry={read.onRetry}
      onRefresh={read.onRetry}
    />
  );
}

/** `/evidence/brocs`: REST `controls/brocs`. */
export function BrocsConnected({
  capabilities,
  client = riskRest,
}: {
  capabilities: readonly string[];
  client?: RiskRestClient;
}) {
  const t = useTranslations("risk.connected");
  const read = useEvidence(client.brocs, "brocs", t("evidenceFailed"));
  return (
    <BrocsScreen
      capabilities={capabilities}
      brocs={read.value}
      loading={read.loading}
      error={read.error}
      onRetry={read.onRetry}
      onRefresh={read.onRetry}
    />
  );
}

const JOBS_KEY = "zentinelle.risk-report-history";

function storedJobIds(): number[] {
  try {
    const parsed: unknown = JSON.parse(
      window.localStorage.getItem(JOBS_KEY) ?? "[]",
    );
    return Array.isArray(parsed)
      ? parsed
          .map((e) => (typeof e === "number" ? e : (e as { id?: number })?.id))
          .filter((id): id is number => typeof id === "number")
      : [];
  } catch {
    return [];
  }
}

function storeJobIds(ids: number[]) {
  try {
    window.localStorage.setItem(JOBS_KEY, JSON.stringify(ids.slice(0, 50)));
  } catch {
    /* storage unavailable: the jobs list is this visit's only */
  }
}

export interface ReportsConnectedProps {
  capabilities: readonly string[];
  /** `?type=`: compliance, risk, or every report. */
  view: ReportsView;
  client?: RiskRestClient;
  /** Today, YYYY-MM-DD; stories pin it. */
  today?: string;
}

/**
 * `/reports`: `GetComplianceReports` and the `reports/` jobs this browser
 * started (the backend lists no jobs), with Generate on
 * `GenerateComplianceReport` or `POST reports/`.
 */
export function ReportsConnected({
  capabilities,
  view,
  client = riskRest,
  today = new Date().toISOString().slice(0, 10),
}: ReportsConnectedProps) {
  const tr = useTranslations("risk.reportsScreen");
  const tc = useTranslations("risk.connected");
  const compliance = useComplianceReports();
  const overview = useComplianceOverview();
  const [generate] = useMutation<{ generateComplianceReport: Payload }>(
    GENERATE_COMPLIANCE_REPORT,
    { refetchQueries: [GET_COMPLIANCE_REPORTS] },
  );
  const [jobIds, setJobIds] = React.useState<number[]>([]);
  React.useEffect(() => {
    const timer = window.setTimeout(() => setJobIds(storedJobIds()), 0);
    return () => window.clearTimeout(timer);
  }, []);
  const jobs = useRest(
    () => Promise.all(jobIds.map((id) => client.job(id).catch(() => null))),
    jobIds.join(","),
  );
  const [open, setOpen] = React.useState(false);
  const frameworks = (overview.overview?.frameworkCoverage ?? [])
    .filter((f) => f.id)
    .map((f) => ({ value: f.id!, label: f.name ?? f.id! }));
  const name = (id: string) =>
    frameworks.find((f) => f.value === id)?.label ?? id;
  const rows = [
    ...compliance.reports.map((r) => fromComplianceReport(r, tr, name)),
    ...(jobs.value ?? [])
      .filter((j): j is ReportJob => j !== null)
      .map((j) => fromReportJob(j, tr, API_URL)),
  ]
    .filter((r) => view === "all" || r.type === view)
    .sort(
      (a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""),
    );

  async function submit(request: ReportRequest): Promise<string | void> {
    try {
      if (request.kind === "compliance") {
        const { data } = await generate({
          variables: {
            frameworkId: request.frameworkId,
            startDate: request.startDate,
            endDate: request.endDate,
          },
        });
        payloadOrThrow(data?.generateComplianceReport, tc("reportFailed"));
        return;
      }
      const job = await client.createJob({
        report_type: request.kind,
        format: request.format,
        params: { date_from: request.dateFrom, date_to: request.dateTo },
      });
      const next = [job.id, ...jobIds];
      storeJobIds(next);
      setJobIds(next);
    } catch (e) {
      return e instanceof Error && e.message ? e.message : tc("reportFailed");
    }
  }

  return (
    <>
      <ReportsScreen
        capabilities={capabilities}
        view={view}
        reports={rows}
        loading={compliance.loading}
        error={compliance.error ?? null}
        onRetry={() => {
          void compliance.refetch();
          jobs.retry();
        }}
        onGenerate={() => setOpen(true)}
      />
      <GenerateReportDialog
        open={open}
        onOpenChange={setOpen}
        frameworks={frameworks}
        today={today}
        onSubmit={submit}
      />
    </>
  );
}
