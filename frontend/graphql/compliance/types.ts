export interface ComplianceCapability {
  id: string | null;
  name: string | null;
  description: string | null;
  capabilityType: string | null;
  enabled: boolean;
  supportingPolicies: string[];
  supportingRules: string[];
  enforcementOptions: string[];
  supportsFrameworks: string[];
}

export interface FrameworkCoverage {
  id: string | null;
  name: string | null;
  description: string | null;
  requiredCovered: number;
  requiredTotal: number;
  requiredPercentage: number;
  missingRequired: string[];
  totalCovered: number;
  totalCount: number;
  totalPercentage: number;
  missingRecommended: string[];
}

export interface ComplianceOverview {
  observeCapabilities: ComplianceCapability[];
  controlCapabilities: ComplianceCapability[];
  capabilitiesEnabled: number;
  capabilitiesTotal: number;
  frameworkCoverage: FrameworkCoverage[];
}

export interface ComplianceOverviewData {
  complianceOverview: ComplianceOverview | null;
}
