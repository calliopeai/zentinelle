export interface OrganizationSettings {
  email_notifications?: boolean | null;
  slack_notifications?: boolean | null;
  webhook_url?: string | null;
  default_policy_mode?: string | null;
  audit_logging?: boolean | null;
  contact_email?: string | null;
  timezone?: string | null;
  [key: string]: unknown;
}

export interface OrganizationData {
  id: string | null;
  name: string | null;
  slug: string | null;
  tier: string | null;
  deploymentModel: string | null;
  zentinelleTier: string | null;
  settings: OrganizationSettings | null;
  createdAt: string | null;
}

export interface MyOrganizationData {
  myOrganization: OrganizationData | null;
}

export interface UpdateOrganizationSettingsInput {
  name?: string | null;
  contactEmail?: string | null;
  timezone?: string | null;
  emailNotifications?: boolean | null;
  slackNotifications?: boolean | null;
  webhookUrl?: string | null;
  defaultPolicyMode?: string | null;
  auditLogging?: boolean | null;
}

export interface UpdateOrganizationSettingsPayload {
  success: boolean | null;
  organization: OrganizationData | null;
}

export interface UpdateOrganizationSettingsData {
  updateOrganizationSettings: UpdateOrganizationSettingsPayload;
}

export interface UpdateOrganizationSettingsVariables {
  settings: UpdateOrganizationSettingsInput;
}
