"use client";

import { useMutation } from "@apollo/client/react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";

import {
  useAcknowledgeComplianceAlert,
  useDismissComplianceAlert,
  useResolveComplianceAlert,
} from "@/graphql/alerts/hooks";
import { GET_COMPLIANCE_ALERTS } from "@/graphql/alerts/queries";
import { useMarkAllNotificationsRead } from "@/graphql/notifications/hooks";
import { UPDATE_NOTIFICATION } from "@/graphql/notifications/mutations";
import { GET_NOTIFICATIONS } from "@/graphql/notifications/queries";
import type {
  UpdateNotificationResult,
  UpdateNotificationVariables,
} from "@/graphql/notifications/types";

import { payloadOrThrow } from "../../shared/mutation";
import { AlertsScreen, type AlertsView } from "./AlertsScreen";
import { useAlertsData } from "./data";

export interface AlertsConnectedProps {
  view: AlertsView;
  canMutate: boolean;
}

/** Runs `act`, and says so in a toast when it fails. */
async function reported(act: () => Promise<unknown>, fallback: string) {
  try {
    await act();
  } catch (failure) {
    toast.error(
      failure instanceof Error && failure.message ? failure.message : fallback,
    );
  }
}

/**
 * Alerts on the app's operations: `ComplianceAlerts` (Open, All) and
 * `Notifications` (Mine) through `useAlertsData`, and the alert and
 * notification mutations. `app/(app)/alerts` renders this with the view
 * from `?view=`.
 */
export function AlertsConnected({ view, canMutate }: AlertsConnectedProps) {
  const t = useTranslations("activity.alerts");
  const data = useAlertsData(view);
  const refetch = { refetchQueries: [GET_COMPLIANCE_ALERTS] };
  const [acknowledge] = useAcknowledgeComplianceAlert();
  const [resolve] = useResolveComplianceAlert();
  const [dismiss] = useDismissComplianceAlert();
  const [update] = useMutation<
    UpdateNotificationResult,
    UpdateNotificationVariables
  >(UPDATE_NOTIFICATION, { refetchQueries: [GET_NOTIFICATIONS] });
  const [markAll] = useMarkAllNotificationsRead();

  return (
    <AlertsScreen
      {...data}
      canMutate={canMutate}
      onAcknowledge={(alert) =>
        void reported(async () => {
          const { data } = await acknowledge({
            variables: { id: alert.id },
            ...refetch,
          });
          payloadOrThrow(
            data?.acknowledgeComplianceAlert,
            t("errors.acknowledge"),
          );
        }, t("errors.acknowledge"))
      }
      onResolve={async (alert, notes) => {
        const { data } = await resolve({
          variables: { id: alert.id, notes: notes || null },
          ...refetch,
        });
        payloadOrThrow(data?.resolveComplianceAlert, t("errors.resolve"));
      }}
      onDismiss={(alert) =>
        void reported(async () => {
          const { data } = await dismiss({
            variables: { id: alert.id },
            ...refetch,
          });
          payloadOrThrow(data?.dismissComplianceAlert, t("errors.dismiss"));
        }, t("errors.dismiss"))
      }
      onMarkRead={(notification, read) =>
        void reported(async () => {
          const { data } = await update({
            variables: {
              id: notification.id,
              status: read ? "READ" : "UNREAD",
            },
          });
          payloadOrThrow(data?.updateNotification, t("errors.markRead"));
        }, t("errors.markRead"))
      }
      onMarkAllRead={() =>
        void reported(async () => {
          const { data } = await markAll({
            refetchQueries: [GET_NOTIFICATIONS],
          });
          payloadOrThrow(
            data?.markAllNotificationsRead,
            t("errors.markAllRead"),
          );
        }, t("errors.markAllRead"))
      }
    />
  );
}
