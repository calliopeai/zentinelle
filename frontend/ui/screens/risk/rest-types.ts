/**
 * The REST answers this area reads, as the backend writes them. No GraphQL
 * operation exists for these, so the route fetches them with
 * authenticatedFetch and passes them to the screens unchanged.
 *
 *   GET evidence/controls   backend/zentinelle/api/views/control_evidence.py (admin)
 *   GET threats/atlas       backend/zentinelle/api/views/atlas.py (admin)
 *   GET controls/brocs      backend/zentinelle/api/views/brocs.py (admin)
 *   GET risks/trend?days=N  backend/zentinelle/api/views/risks_trend.py
 */

export interface EvidenceRecord {
  id: string;
  control_id: string;
  status: string;
  effective_status: string;
  owner: string;
  evidence_links: string[];
  captured_at: string;
  expires_at: string | null;
  source: string;
  notes: string;
}

export interface Workload {
  agent_id: string;
  endpoint_id: string;
  status: "observed" | "unknown";
  registered_status: string;
  last_observed_at: string | null;
  last_event_id: string | null;
  last_event_type: string | null;
}

export interface ControlEvidenceResponse {
  evidence: EvidenceRecord[];
  coverage: Record<string, number>;
  runtime_coverage: {
    registered_workloads: number;
    observed_workloads: number;
    unobserved_workloads: number;
    coverage_as_of: string | null;
    workloads: Workload[];
  };
  coverage_as_of: string | null;
}

export interface AtlasTechnique {
  id: string | null;
  name: string;
  control?: string;
  enforcement_point?: string;
  owner?: string;
  evidence_test?: string;
  residual_risk?: string;
  evidence_status: string;
  evidence_captured_at: string | null;
  evidence_id: string | null;
}

export interface AtlasResponse {
  source: string;
  source_url: string;
  source_revision: string;
  retrieved_at?: string;
  disclaimer: string;
  techniques: AtlasTechnique[];
}

export interface BrocsDomain {
  id: string;
  owner: string;
  control: string;
  evidence_test: string;
  customer_responsibility: string;
  evidence_status: string;
  evidence_id: string | null;
  evidence_captured_at: string | null;
}

export interface BrocsResponse {
  framework: string;
  source_url: string;
  source_revision: string;
  disclaimer: string;
  domains: BrocsDomain[];
}

export interface RiskTrendPoint {
  day: string;
  index: number;
  open_count: number;
}

export interface RiskTrendResponse {
  trend: RiskTrendPoint[];
}

/** A report job, as `POST reports/` and `GET reports/{id}/` serialize it (api/views/reports.py). */
export interface ReportJob {
  id: number;
  report_type: "control_coverage" | "violation_summary" | "audit_trail";
  status: "pending" | "running" | "completed" | "failed";
  format: "csv" | "pdf" | "ndjson";
  params: Record<string, unknown>;
  created_at: string | null;
  completed_at: string | null;
  error_message: string | null;
}
