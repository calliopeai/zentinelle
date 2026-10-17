/**
 * Activity shapes that no GraphQL operation carries. Incident comments live
 * only behind REST `incidents/{id}/comments/`; this mirrors
 * `_serialize_comment` in backend/zentinelle/api/views/incidents.py.
 */
export interface IncidentComment {
  id: number;
  /** The author's user id; the endpoint returns no name. */
  author_id: string;
  body: string;
  created_at: string | null;
}

/** REST `audit/verify`, as backend AuditChainVerifyView answers. */
export interface AuditChainVerification {
  valid: boolean;
  records_checked: number;
  broken_at_sequence: number | null;
  root_hash: string;
  expected_hash?: string;
  actual_hash?: string;
  /** Records written before hashing began, which the chain cannot vouch for. */
  unverifiable_records?: number;
  archived_through_sequence?: number | null;
}
