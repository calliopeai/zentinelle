"use client";

import { useTranslations } from "next-intl";
import * as React from "react";

import { authenticatedFetch } from "@/lib/auth/fetch";

import { AuditLogScreen } from "./AuditLogScreen";
import { useAuditLogData } from "./data";
import type { AuditChainVerification } from "./types";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/zentinelle/v1";

/** REST `audit/verify`; an empty message when the server says nothing itself. */
export async function verifyAuditChain(): Promise<AuditChainVerification> {
  const response = await authenticatedFetch(`${API_URL}/audit/verify`, {
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      detail?: string;
    };
    throw new Error(body.error || body.detail || "");
  }
  return (await response.json()) as AuditChainVerification;
}

export interface AuditLogConnectedProps {
  /** The chain check; stories pass their own. */
  verify?: () => Promise<AuditChainVerification>;
  /** Today, YYYY-MM-DD in UTC; stories pin it. */
  today?: string;
}

/** The audit log on `GetAuditLogs` (`useAuditLogData`), its exports and the chain check. `app/(app)/audit-logs` renders this. */
export function AuditLogConnected({
  verify = verifyAuditChain,
  today = new Date().toISOString().slice(0, 10),
}: AuditLogConnectedProps) {
  const t = useTranslations("activity.audit");
  const data = useAuditLogData();
  const [state, setState] = React.useState<{
    verifying: boolean;
    result: AuditChainVerification | null;
    error: Error | null;
  }>({ verifying: false, result: null, error: null });

  async function onVerify() {
    setState({ verifying: true, result: null, error: null });
    try {
      setState({ verifying: false, result: await verify(), error: null });
    } catch (e) {
      setState({
        verifying: false,
        result: null,
        error:
          e instanceof Error && e.message ? e : new Error(t("errors.verify")),
      });
    }
  }

  return (
    <AuditLogScreen
      {...data}
      apiBase={API_URL}
      today={today}
      verify={state}
      onVerify={() => void onVerify()}
    />
  );
}
