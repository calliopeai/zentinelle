"use client";

import { use } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircleIcon,
  XCircleIcon,
  ArrowLeftIcon,
  ShieldCheckIcon,
  AlertTriangleIcon,
  InfoIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";

const FRAMEWORK_DATA: Record<
  string,
  {
    name: string;
    fullName: string;
    description: string;
    controls: Array<{
      id: string;
      name: string;
      description: string;
      category: string;
      status: "met" | "partial" | "not_met";
      zentinelleFeature: string;
    }>;
  }
> = {
  soc2: {
    name: "SOC 2",
    fullName: "SOC 2 Type II — Trust Services Criteria",
    description:
      "Security, availability, processing integrity, confidentiality, and privacy controls for service organizations.",
    controls: [
      { id: "CC6.1", name: "Logical Access Controls", description: "Restrict access to information assets", category: "Security", status: "met", zentinelleFeature: "RBAC roles + API key auth" },
      { id: "CC6.2", name: "Access Authentication", description: "Authenticate users before granting access", category: "Security", status: "met", zentinelleFeature: "Session auth + OIDC/SSO" },
      { id: "CC6.3", name: "Access Authorization", description: "Authorize access based on roles", category: "Security", status: "met", zentinelleFeature: "Policy engine + RBAC" },
      { id: "CC7.1", name: "Monitoring Activities", description: "Monitor system components for anomalies", category: "Security", status: "met", zentinelleFeature: "Event monitoring + audit logs" },
      { id: "CC7.2", name: "Incident Response", description: "Procedures to detect and respond to incidents", category: "Security", status: "met", zentinelleFeature: "Incident management + webhooks" },
      { id: "CC8.1", name: "Change Management", description: "Authorize, test, and implement changes", category: "Security", status: "partial", zentinelleFeature: "Policy versioning" },
      { id: "CC3.1", name: "Risk Assessment", description: "Identify and assess risks", category: "Risk", status: "met", zentinelleFeature: "Risk register + 5x5 matrix" },
      { id: "CC3.2", name: "Risk Mitigation", description: "Implement risk mitigation strategies", category: "Risk", status: "met", zentinelleFeature: "Policy enforcement + content scanning" },
      { id: "CC5.1", name: "Activity Logging", description: "Log and monitor system activities", category: "Availability", status: "met", zentinelleFeature: "Audit log chain + event pipeline" },
      { id: "PI1.1", name: "Data Processing Integrity", description: "Ensure processing completeness and accuracy", category: "Processing Integrity", status: "partial", zentinelleFeature: "Content scanning + output filters" },
      { id: "C1.1", name: "Data Classification", description: "Classify and protect confidential data", category: "Confidentiality", status: "met", zentinelleFeature: "PII/PHI detection + secret scanning" },
      { id: "P1.1", name: "Privacy Notice", description: "Provide notice about data practices", category: "Privacy", status: "not_met", zentinelleFeature: "Not in scope — organizational policy" },
    ],
  },
  gdpr: {
    name: "GDPR",
    fullName: "General Data Protection Regulation (EU)",
    description:
      "European Union regulation on data protection and privacy for individuals within the EU and EEA.",
    controls: [
      { id: "Art.5", name: "Data Processing Principles", description: "Lawfulness, fairness, transparency, purpose limitation, data minimization", category: "Principles", status: "partial", zentinelleFeature: "Content scanning + data retention policies" },
      { id: "Art.6", name: "Lawful Basis", description: "Establish lawful basis for processing", category: "Principles", status: "not_met", zentinelleFeature: "Organizational policy — outside Zentinelle scope" },
      { id: "Art.17", name: "Right to Erasure", description: "Delete personal data on request", category: "Data Subject Rights", status: "met", zentinelleFeature: "Data retention TTL enforcement + legal holds" },
      { id: "Art.25", name: "Data Protection by Design", description: "Implement data protection measures", category: "Design", status: "met", zentinelleFeature: "PII detection + content redaction policies" },
      { id: "Art.30", name: "Records of Processing", description: "Maintain records of processing activities", category: "Accountability", status: "met", zentinelleFeature: "Audit logs + interaction logs" },
      { id: "Art.32", name: "Security of Processing", description: "Implement appropriate security measures", category: "Security", status: "met", zentinelleFeature: "Encryption + access control + policy enforcement" },
      { id: "Art.33", name: "Breach Notification", description: "Notify supervisory authority of breaches", category: "Security", status: "met", zentinelleFeature: "Incident management + webhook alerts" },
      { id: "Art.35", name: "Data Protection Impact Assessment", description: "Assess impact of data processing on privacy", category: "Accountability", status: "partial", zentinelleFeature: "Risk register + compliance reports" },
    ],
  },
  hipaa: {
    name: "HIPAA",
    fullName: "Health Insurance Portability and Accountability Act",
    description:
      "US regulation for protecting sensitive patient health information (PHI).",
    controls: [
      { id: "§164.312(a)", name: "Access Control", description: "Implement technical policies for electronic PHI access", category: "Technical Safeguards", status: "met", zentinelleFeature: "Policy engine + RBAC + API key auth" },
      { id: "§164.312(b)", name: "Audit Controls", description: "Implement mechanisms to record and examine activity", category: "Technical Safeguards", status: "met", zentinelleFeature: "Tamper-evident audit log chain" },
      { id: "§164.312(c)", name: "Integrity Controls", description: "Protect electronic PHI from improper alteration", category: "Technical Safeguards", status: "met", zentinelleFeature: "Content scanning + output filters" },
      { id: "§164.312(d)", name: "Person Authentication", description: "Verify identity of persons seeking PHI access", category: "Technical Safeguards", status: "met", zentinelleFeature: "Session auth + OIDC/SSO + MFA (via OIDC)" },
      { id: "§164.312(e)", name: "Transmission Security", description: "Guard against unauthorized access during transmission", category: "Technical Safeguards", status: "met", zentinelleFeature: "HTTPS enforced + proxy TLS" },
      { id: "§164.308(a)(1)", name: "Risk Analysis", description: "Conduct accurate risk assessment", category: "Administrative Safeguards", status: "met", zentinelleFeature: "Risk register + 5x5 matrix + gap analysis" },
      { id: "§164.308(a)(6)", name: "Incident Procedures", description: "Identify and respond to security incidents", category: "Administrative Safeguards", status: "met", zentinelleFeature: "Incident management + SLA tracking" },
      { id: "§164.530(j)", name: "Retention Requirements", description: "Retain required documentation for 6 years", category: "Administrative Safeguards", status: "met", zentinelleFeature: "Data retention policies + legal holds" },
    ],
  },
  "eu-ai-act": {
    name: "EU AI Act",
    fullName: "European Union Artificial Intelligence Act",
    description:
      "First comprehensive AI regulation. Risk-based approach to AI governance.",
    controls: [
      { id: "Art.9", name: "Risk Management System", description: "Establish and maintain risk management for high-risk AI", category: "High-Risk AI", status: "met", zentinelleFeature: "Risk register + policy engine + evaluators" },
      { id: "Art.10", name: "Data Governance", description: "Training, validation, and testing data governance", category: "High-Risk AI", status: "partial", zentinelleFeature: "Content scanning + data retention" },
      { id: "Art.11", name: "Technical Documentation", description: "Draw up technical documentation", category: "High-Risk AI", status: "partial", zentinelleFeature: "System prompts + policy documentation" },
      { id: "Art.12", name: "Record-Keeping", description: "Automatic logging of AI system operations", category: "High-Risk AI", status: "met", zentinelleFeature: "Audit logs + interaction logs + event pipeline" },
      { id: "Art.13", name: "Transparency", description: "Designed to allow users to interpret output", category: "High-Risk AI", status: "met", zentinelleFeature: "Policy evaluation results + monitoring dashboard" },
      { id: "Art.14", name: "Human Oversight", description: "Allow human oversight during operation", category: "High-Risk AI", status: "met", zentinelleFeature: "Human oversight policy + approval workflows" },
      { id: "Art.15", name: "Accuracy & Robustness", description: "Achieve appropriate levels of accuracy", category: "High-Risk AI", status: "partial", zentinelleFeature: "Model restrictions + output filters + safety settings" },
      { id: "Art.52", name: "Transparency Obligations", description: "Notify users they are interacting with AI", category: "General", status: "not_met", zentinelleFeature: "Application-level concern — outside Zentinelle scope" },
    ],
  },
  nist: {
    name: "NIST AI RMF",
    fullName: "NIST AI Risk Management Framework",
    description:
      "Voluntary framework for managing AI risks throughout the AI lifecycle.",
    controls: [
      { id: "GOVERN", name: "Govern", description: "Cultivate and sustain AI risk management culture", category: "Govern", status: "met", zentinelleFeature: "RBAC + policy engine + audit trails" },
      { id: "MAP", name: "Map", description: "Identify context and map AI risks", category: "Map", status: "met", zentinelleFeature: "Risk register + model registry + agent inventory" },
      { id: "MEASURE", name: "Measure", description: "Assess, analyze, and track AI risks", category: "Measure", status: "met", zentinelleFeature: "Usage analytics + monitoring + compliance scoring" },
      { id: "MANAGE", name: "Manage", description: "Prioritize and act on AI risks", category: "Manage", status: "met", zentinelleFeature: "Policy enforcement + incident response + remediation" },
      { id: "GOV-1", name: "Legal & Regulatory", description: "Comply with applicable legal requirements", category: "Govern", status: "met", zentinelleFeature: "Compliance frameworks + gap analysis + reports" },
      { id: "GOV-3", name: "Workforce Diversity", description: "Include diverse perspectives in AI development", category: "Govern", status: "not_met", zentinelleFeature: "Organizational concern — outside Zentinelle scope" },
      { id: "MAP-1", name: "AI System Inventory", description: "Identify and catalog AI systems", category: "Map", status: "met", zentinelleFeature: "Agent registry + model registry" },
      { id: "MEASURE-2", name: "Performance Metrics", description: "Track AI system performance", category: "Measure", status: "met", zentinelleFeature: "Usage metrics + latency tracking + cost monitoring" },
    ],
  },
};

export default function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ framework: string }>;
}) {
  const { framework } = use(params);
  const data = FRAMEWORK_DATA[framework];

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 p-12">
        <p className="text-muted-foreground">Framework not found</p>
        <Link href="/compliance">
          <Button variant="outline">
            <ArrowLeftIcon className="mr-2 h-4 w-4" /> Back to Compliance
          </Button>
        </Link>
      </div>
    );
  }

  const met = data.controls.filter((c) => c.status === "met").length;
  const partial = data.controls.filter((c) => c.status === "partial").length;
  const notMet = data.controls.filter((c) => c.status === "not_met").length;
  const total = data.controls.length;
  const score = Math.round(((met + partial * 0.5) / total) * 100);

  const categories = [...new Set(data.controls.map((c) => c.category))];

  const statusIcon = (status: string) => {
    switch (status) {
      case "met":
        return <CheckCircleIcon className="h-4 w-4 text-emerald-500" />;
      case "partial":
        return <AlertTriangleIcon className="h-4 w-4 text-amber-500" />;
      case "not_met":
        return <XCircleIcon className="h-4 w-4 text-red-500" />;
      default:
        return <InfoIcon className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "met":
        return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20">Met</Badge>;
      case "partial":
        return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/20">Partial</Badge>;
      case "not_met":
        return <Badge className="bg-red-500/10 text-red-500 border-red-500/20">Not Met</Badge>;
      default:
        return <Badge variant="outline">Unknown</Badge>;
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center gap-4">
        <Link href="/compliance">
          <Button variant="ghost" size="icon">
            <ArrowLeftIcon className="h-4 w-4" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-semibold">{data.name}</h1>
          <p className="text-muted-foreground text-sm">{data.fullName}</p>
        </div>
      </div>

      <p className="text-muted-foreground max-w-3xl">{data.description}</p>

      {/* Score cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-primary">{score}%</div>
            <div className="text-muted-foreground text-sm">Coverage Score</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-emerald-500">{met}</div>
            <div className="text-muted-foreground text-sm">Controls Met</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-amber-500">{partial}</div>
            <div className="text-muted-foreground text-sm">Partial</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <div className="text-3xl font-bold text-red-500">{notMet}</div>
            <div className="text-muted-foreground text-sm">Not Met</div>
          </CardContent>
        </Card>
      </div>

      {/* Controls by category */}
      {categories.map((cat) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheckIcon className="h-5 w-5" />
              {cat}
            </CardTitle>
            <CardDescription>
              {data.controls.filter((c) => c.category === cat && c.status === "met").length} of{" "}
              {data.controls.filter((c) => c.category === cat).length} controls met
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {data.controls
                .filter((c) => c.category === cat)
                .map((control) => (
                  <div
                    key={control.id}
                    className="flex items-start gap-3 rounded-lg border p-3"
                  >
                    <div className="mt-0.5">{statusIcon(control.status)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">
                          {control.id}
                        </span>
                        <span className="font-medium text-sm">{control.name}</span>
                        {statusBadge(control.status)}
                      </div>
                      <p className="text-muted-foreground text-xs mt-1">
                        {control.description}
                      </p>
                      <p className="text-xs mt-1">
                        <span className="text-muted-foreground">Zentinelle: </span>
                        <span className="text-primary">{control.zentinelleFeature}</span>
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
