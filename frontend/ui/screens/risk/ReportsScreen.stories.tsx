import type { Meta, StoryObj } from "@storybook/react-vite";
import * as React from "react";
import { expect, userEvent, within } from "storybook/test";

import { useComplianceReports } from "@/graphql/compliance-reports/hooks";

import type { Role } from "../../product";
import {
  NARROW,
  complianceReports,
  reportsMocks,
} from "../../storybook/fixtures/risk";
import { capabilitiesOf } from "../../storybook/session";
import { ShellStory } from "../../storybook/ShellStory";
import { GenerateReportDialog } from "./components/GenerateReportDialog";
import type { ReportJob } from "./rest-types";
import {
  ReportsScreen,
  fromComplianceReport,
  fromReportJob,
  type ReportRow,
  type ReportsScreenProps,
  type ReportsView,
} from "./ReportsScreen";

/**
 * Reports (new): `GetComplianceReports` and the `reports/` jobs in one list,
 * replacing `/risks/reports` and `/compliance/reports`.
 */
const meta = {
  title: "Risk & compliance/Screens/Reports",
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const NAMES: Record<string, string> = {
  HIPAA: "HIPAA",
  SOC2: "SOC 2 Type II",
  EU_AI_ACT: "EU AI Act",
};

const jobs: ReportJob[] = [
  {
    id: 41,
    report_type: "audit_trail",
    status: "completed",
    format: "ndjson",
    params: { date_from: "2026-09-01", date_to: "2026-09-30" },
    created_at: "2026-10-02T09:00:00Z",
    completed_at: "2026-10-02T09:03:00Z",
    error_message: null,
  },
  {
    id: 42,
    report_type: "violation_summary",
    status: "running",
    format: "pdf",
    params: {},
    created_at: "2026-10-16T13:59:00Z",
    completed_at: null,
    error_message: null,
  },
];

const rows: ReportRow[] = [
  ...complianceReports.map((r) =>
    fromComplianceReport(r, (id) => NAMES[id] ?? id),
  ),
  ...jobs.map((j) => fromReportJob(j)),
].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));

function Reports({
  role = "operator",
  view = "all",
  ...props
}: Partial<ReportsScreenProps> & { role?: Role; view?: ReportsView }) {
  const [open, setOpen] = React.useState(false);
  return (
    <ShellStory
      path={view === "all" ? "/reports" : `/reports?type=${view}`}
      role={role}
      defaultAssistantHidden
    >
      <ReportsScreen
        capabilities={capabilitiesOf(role)}
        view={view}
        reports={rows}
        onGenerate={() => setOpen(true)}
        {...props}
      />
      <GenerateReportDialog
        open={open}
        onOpenChange={setOpen}
        frameworks={Object.entries(NAMES).map(([value, label]) => ({
          value,
          label,
        }))}
        today="2026-10-16"
        onSubmit={async () => undefined}
      />
    </ShellStory>
  );
}

export const All: Story = {
  render: () => <Reports />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      canvas.getByRole("link", { name: "Download Audit trail" }),
    ).toHaveAttribute("href", "/api/zentinelle/v1/reports/41/download/");
    await userEvent.click(
      canvas.getByRole("button", { name: "Generate report" }),
    );
    await expect(
      await within(document.body).findByRole("dialog"),
    ).toBeInTheDocument();
  },
};

export const Compliance: Story = {
  render: () => <Reports view="compliance" />,
};

export const RiskAndAudit: Story = { render: () => <Reports view="risk" /> };

export const Viewer: Story = {
  render: () => <Reports role="viewer" />,
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole("button", { name: "Generate report" }),
    ).toBeNull();
  },
};

export const Loading: Story = {
  render: () => <Reports reports={[]} loading />,
};

export const Empty: Story = { render: () => <Reports reports={[]} /> };

export const EmptyForThisType: Story = {
  render: () => (
    <Reports
      view="risk"
      reports={rows.filter((r) => r.type === "compliance")}
    />
  ),
};

export const LoadError: Story = {
  render: () => (
    <Reports
      reports={[]}
      error={{ message: "complianceReports failed." }}
      onRetry={() => {}}
    />
  ),
};

export const LongData: Story = {
  render: () => (
    <Reports
      reports={Array.from({ length: 60 }, (_, i) => ({
        ...rows[i % rows.length],
        key: `r-${i}`,
        name: `${rows[i % rows.length].name}, regional breakdown for the EU, US and APAC tenants, revision ${i}`,
      }))}
    />
  ),
};

export const Narrow: Story = { ...NARROW, render: () => <Reports /> };

function Connected() {
  const { reports, loading, error, refetch } = useComplianceReports({
    first: 25,
  });
  return (
    <ShellStory path="/reports" role="viewer" defaultAssistantHidden>
      <ReportsScreen
        capabilities={capabilitiesOf("viewer")}
        view="all"
        reports={reports.map((r) => fromComplianceReport(r))}
        loading={loading}
        error={error}
        onRetry={() => void refetch()}
      />
    </ShellStory>
  );
}

/** The app's `useComplianceReports` hook, answered by a mock of `GetComplianceReports`. */
export const ConnectedToGetComplianceReports: Story = {
  parameters: { graphql: { mocks: reportsMocks.list } },
  render: () => <Connected />,
  play: async ({ canvasElement }) => {
    await expect(
      await within(canvasElement).findByText("EU AI Act readiness"),
    ).toBeInTheDocument();
  },
};
