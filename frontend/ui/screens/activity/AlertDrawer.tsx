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
  const active = alert ? isAlertActive(alert.status) : false;
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
                {alert.description || "No description."}
              </DrawerDescription>
            </DrawerHeader>
            <div className="px-4">
              <DefinitionList
                columns={1}
                items={[
                  {
                    term: "Type",
                    value: alert.alertTypeDisplay ?? humanize(alert.alertType),
                  },
                  { term: "Agent", value: alert.endpointName },
                  { term: "User", value: alert.userIdentifier, mono: true },
                  { term: "Violations", value: alert.violationCount },
                  {
                    term: "First violation",
                    value: formatDateTime(alert.firstViolationAt),
                  },
                  {
                    term: "Last violation",
                    value: formatDateTime(alert.lastViolationAt),
                  },
                  {
                    term: "Acknowledged",
                    value: alert.acknowledgedAt
                      ? `${formatDateTime(alert.acknowledgedAt)}${alert.acknowledgedByUsername ? ` by ${alert.acknowledgedByUsername}` : ""}`
                      : null,
                  },
                  {
                    term: "Resolved",
                    value: alert.resolvedAt
                      ? `${formatDateTime(alert.resolvedAt)}${alert.resolvedByUsername ? ` by ${alert.resolvedByUsername}` : ""}`
                      : null,
                  },
                  { term: "Resolution notes", value: alert.resolutionNotes },
                ]}
              />
            </div>
            {canMutate && active && (
              <DrawerFooter className="flex-row flex-wrap justify-end gap-2">
                <Button variant="ghost" onClick={() => onDismiss?.(alert)}>
                  Dismiss
                </Button>
                {alert.status === "open" && (
                  <Button
                    variant="outline"
                    onClick={() => onAcknowledge?.(alert)}
                  >
                    Acknowledge
                  </Button>
                )}
                <Button onClick={() => onResolve?.(alert)}>Resolve</Button>
              </DrawerFooter>
            )}
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
