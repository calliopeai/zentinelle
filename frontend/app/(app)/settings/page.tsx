"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  GlobeIcon,
  BellIcon,
  BuildingIcon,
  PaletteIcon,
  ShieldIcon,
  Loader2Icon,
  TerminalIcon,
} from "lucide-react";
import { toast } from "sonner";

import {
  useMyOrganization,
  useUpdateOrganizationSettings,
} from "@/graphql/settings/hooks";
import type { OrganizationData } from "@/graphql/settings/types";

const POLICY_MODES = [
  { value: "monitor", label: "Monitor (log only)" },
  { value: "warn", label: "Warn (log + notify)" },
  { value: "block", label: "Block (enforce)" },
];

function SettingsForm({ organization }: { organization: OrganizationData }) {
  const settings = organization.settings ?? {};

  const [updateSettings] = useUpdateOrganizationSettings();

  const [orgName, setOrgName] = useState(organization.name ?? "");
  const [contactEmail, setContactEmail] = useState<string>(
    (settings.contact_email as string) ?? "",
  );
  const [timezone, setTimezone] = useState<string>(
    (settings.timezone as string) ?? "",
  );
  const [orgSaving, setOrgSaving] = useState(false);

  const [defaultPolicyMode, setDefaultPolicyMode] = useState<string>(
    (settings.default_policy_mode as string) ?? "monitor",
  );
  const [auditLogging, setAuditLogging] = useState<boolean>(
    Boolean(settings.audit_logging ?? true),
  );
  const [enforcementSaving, setEnforcementSaving] = useState(false);

  const [emailNotifications, setEmailNotifications] = useState<boolean>(
    Boolean(settings.email_notifications ?? false),
  );
  const [slackNotifications, setSlackNotifications] = useState<boolean>(
    Boolean(settings.slack_notifications ?? false),
  );
  const [webhookUrl, setWebhookUrl] = useState<string>(
    (settings.webhook_url as string) ?? "",
  );
  const [notificationsSaving, setNotificationsSaving] = useState(false);

  const handleSaveOrganization = async () => {
    setOrgSaving(true);
    try {
      const { data } = await updateSettings({
        variables: {
          settings: {
            name: orgName.trim() || null,
            contactEmail: contactEmail.trim() || null,
            timezone: timezone.trim() || null,
          },
        },
      });
      if (data?.updateOrganizationSettings?.success) {
        toast.success("Organization settings saved");
      } else {
        toast.error("Failed to save organization settings");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save organization",
      );
    } finally {
      setOrgSaving(false);
    }
  };

  const handleSaveEnforcement = async () => {
    setEnforcementSaving(true);
    try {
      const { data } = await updateSettings({
        variables: {
          settings: {
            defaultPolicyMode,
            auditLogging,
          },
        },
      });
      if (data?.updateOrganizationSettings?.success) {
        toast.success("Enforcement settings saved");
      } else {
        toast.error("Failed to save enforcement settings");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save enforcement",
      );
    } finally {
      setEnforcementSaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    setNotificationsSaving(true);
    try {
      const { data } = await updateSettings({
        variables: {
          settings: {
            emailNotifications,
            slackNotifications,
            webhookUrl: webhookUrl.trim() || null,
          },
        },
      });
      if (data?.updateOrganizationSettings?.success) {
        toast.success("Notification settings saved");
      } else {
        toast.error("Failed to save notification settings");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to save notifications",
      );
    } finally {
      setNotificationsSaving(false);
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BuildingIcon className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-base">Organization</CardTitle>
          </div>
          <CardDescription>
            Basic organization settings and contact information
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="Your organization"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Contact Email</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="admin@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                placeholder="America/New_York"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveOrganization}
              disabled={orgSaving}
            >
              {orgSaving && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldIcon className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-base">Enforcement</CardTitle>
          </div>
          <CardDescription>
            Default policy enforcement mode and audit logging behavior
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="default-policy-mode">Default Enforcement Mode</Label>
              <Select
                value={defaultPolicyMode}
                onValueChange={setDefaultPolicyMode}
              >
                <SelectTrigger id="default-policy-mode">
                  <SelectValue placeholder="Select mode" />
                </SelectTrigger>
                <SelectContent>
                  {POLICY_MODES.map((m) => (
                    <SelectItem key={m.value} value={m.value}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-muted-foreground text-xs">
                Applied to new policies that don&apos;t specify a mode
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <Label htmlFor="audit-logging" className="text-sm font-medium">
                Audit Logging
              </Label>
              <p className="text-muted-foreground mt-0.5 text-xs">
                Record every policy decision for compliance review
              </p>
            </div>
            <Switch
              id="audit-logging"
              checked={auditLogging}
              onCheckedChange={setAuditLogging}
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveEnforcement}
              disabled={enforcementSaving}
            >
              {enforcementSaving && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellIcon className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-base">Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure how you receive alerts and incidents
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label
                  htmlFor="email-notifications"
                  className="text-sm font-medium"
                >
                  Email Notifications
                </Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Send incident and policy alerts to the contact email
                </p>
              </div>
              <Switch
                id="email-notifications"
                checked={emailNotifications}
                onCheckedChange={setEmailNotifications}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <Label
                  htmlFor="slack-notifications"
                  className="text-sm font-medium"
                >
                  Slack Notifications
                </Label>
                <p className="text-muted-foreground mt-0.5 text-xs">
                  Send alerts to a Slack channel via webhook
                </p>
              </div>
              <Switch
                id="slack-notifications"
                checked={slackNotifications}
                onCheckedChange={setSlackNotifications}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="webhook-url">Webhook URL</Label>
            <Input
              id="webhook-url"
              type="url"
              placeholder="https://hooks.slack.com/services/..."
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              POST endpoint that receives JSON-formatted alert payloads
            </p>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={handleSaveNotifications}
              disabled={notificationsSaving}
            >
              {notificationsSaving && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

export default function SettingsPage() {
  const { organization, loading } = useMyOrganization();

  if (loading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="mt-1 h-4 w-64" />
        </div>
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
        <Skeleton className="h-48 w-full rounded-md" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure your organization and portal preferences
        </p>
      </div>

      {organization && (
        <SettingsForm
          key={organization.id ?? "default"}
          organization={organization}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <TerminalIcon className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-base">Bootstrap Tokens</CardTitle>
          </div>
          <CardDescription>
            Tokens for agent registration and SDK authentication
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="bg-muted/40 rounded-lg border border-dashed p-4">
            <p className="text-sm font-medium">Manage tokens via the CLI</p>
            <p className="text-muted-foreground mt-1 text-xs">
              Bootstrap tokens are managed from the Zentinelle backend host for
              security. Run:
            </p>
            <code className="bg-background mt-3 block overflow-x-auto rounded-md border px-3 py-2 text-xs">
              python manage.py bootstrap_token generate &lt;tenant_id&gt;
              --label &quot;production agent&quot;
            </code>
            <p className="text-muted-foreground mt-3 text-xs">
              Other commands: <code className="text-foreground">list</code>,{" "}
              <code className="text-foreground">revoke &lt;prefix&gt;</code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Separator />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <GlobeIcon className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">Language</h2>
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Choose your preferred language
          </p>
        </div>
        <div className="col-span-full md:col-span-2">
          <LanguageSwitcher variant="select" />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <PaletteIcon className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">Theme</h2>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Switch between light and dark mode
          </p>
        </div>
        <div className="col-span-full md:col-span-2">
          <ThemeToggle variant="select" />
        </div>
      </div>
    </div>
  );
}
