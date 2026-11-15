import {
  Button,
  DefinitionList,
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  StatusBadge,
} from "@calliopelabs/ui";
import { useTranslations } from "next-intl";

import type { ComplianceAlertData } from "@/graphql/alerts/types";

import { formatDateTime, humanize } from "../../shared/format";
import { ALERT_STATUS_TONE, SEVERITY_TONE, toneOf } from "./tones";

export interface AlertDrawerProps {
  /** The alert on show; null closes the drawer. */
  alert: ComplianceAlertData | null;
  onClose: () => void;
  /** Operators and admins act on alerts; viewers read them. */
  canMutate: boolean;
  onAcknowledge?: (alert: ComplianceAlertData) => void;
  onResolve?: (alert: ComplianceAlertData) => void;
  onDismiss?: (alert: ComplianceAlertData) => void;
}

/** Whether an alert still takes an action. */
export function isAlertActive(status: string) {
  return !["resolved", "false_positive", "dismissed"].includes(status);
}

/** One alert in a side sheet: what fired, on which agent, who handled it, and the actions left. */
export function AlertDrawer({
  alert,
  onClose,
  canMutate,
  onAcknowledge,
  onResolve,
  onDismiss,
}: AlertDrawerProps) {
  const t = useTranslations("activity.alerts");
  const active = alert ? isAlertActive(alert.status) : false;
  const by = (at: string, name: string | null | undefined) =>
    name
      ? t("drawer.by", { time: formatDateTime(at), name })
      : formatDateTime(at);
  return (
    <Drawer open={alert !== null} onOpenChange={(open) => !open && onClose()}>
      <DrawerContent className="sm:max-w-lg">
        {alert && (
          <>
            <DrawerHeader>
              <div className="flex flex-wrap items-center gap-2 pr-6">
                <StatusBadge tone={toneOf(SEVERITY_TONE, alert.severity)}>
                  {alert.severityDisplay ?? humanize(alert.severity)}
                </StatusBadge>
                <StatusBadge tone={toneOf(ALERT_STATUS_TONE, alert.status)}>
                  {alert.statusDisplay ?? humanize(alert.status)}
                </StatusBadge>
              </div>
              <DrawerTitle className="break-words">{alert.title}</DrawerTitle>
              <DrawerDescription className="break-words">
                {alert.description || t("drawer.noDescription")}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4">
              <DefinitionList
                columns={1}
                items={[
                  {
                    term: t("drawer.type"),
                    description:
                      (alert.alertTypeDisplay ?? humanize(alert.alertType)) ||
                      null,
                  },
                  {
                    term: t("drawer.agent"),
                    description: alert.endpointName || null,
                  },
                  {
                    term: t("drawer.user"),
                    description: alert.userIdentifier ? (
                      <span className="font-mono text-xs">
                        {alert.userIdentifier}
                      </span>
                    ) : null,
                  },
                  {
                    term: t("drawer.violations"),
                    description: alert.violationCount,
                  },
                  {
                    term: t("drawer.first"),
                    description: formatDateTime(alert.firstViolationAt),
                  },
                  {
                    term: t("drawer.last"),
                    description: formatDateTime(alert.lastViolationAt),
                  },
                  {
                    term: t("drawer.acknowledged"),
                    description: alert.acknowledgedAt
                      ? by(alert.acknowledgedAt, alert.acknowledgedByUsername)
                      : null,
                  },
                  {
                    term: t("drawer.resolved"),
                    description: alert.resolvedAt
                      ? by(alert.resolvedAt, alert.resolvedByUsername)
                      : null,
                  },
                  {
                    term: t("drawer.notes"),
                    description: alert.resolutionNotes || null,
                  },
                ]}
              />
            </div>
            {canMutate && active && (
              <DrawerFooter className="flex-row flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => onDismiss?.(alert)}>
                  {t("dismiss")}
                </Button>
                {alert.status === "open" && (
                  <Button
                    variant="outline"
                    onClick={() => onAcknowledge?.(alert)}
                  >
                    {t("acknowledge")}
                  </Button>
                )}
                <Button onClick={() => onResolve?.(alert)}>
                  {t("resolve")}
                </Button>
              </DrawerFooter>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
