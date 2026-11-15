import {
  Button,
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

import { DefinitionList } from "./components/DefinitionList";
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
                    value: alert.alertTypeDisplay ?? humanize(alert.alertType),
                  },
                  { term: t("drawer.agent"), value: alert.endpointName },
                  {
                    term: t("drawer.user"),
                    value: alert.userIdentifier,
                    mono: true,
                  },
                  {
                    term: t("drawer.violations"),
                    value: alert.violationCount,
                  },
                  {
                    term: t("drawer.first"),
                    value: formatDateTime(alert.firstViolationAt),
                  },
                  {
                    term: t("drawer.last"),
                    value: formatDateTime(alert.lastViolationAt),
                  },
                  {
                    term: t("drawer.acknowledged"),
                    value: alert.acknowledgedAt
                      ? by(alert.acknowledgedAt, alert.acknowledgedByUsername)
                      : null,
                  },
                  {
                    term: t("drawer.resolved"),
                    value: alert.resolvedAt
                      ? by(alert.resolvedAt, alert.resolvedByUsername)
                      : null,
                  },
                  {
                    term: t("drawer.notes"),
                    value: alert.resolutionNotes,
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
