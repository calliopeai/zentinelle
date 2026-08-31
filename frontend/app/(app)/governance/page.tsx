import Link from "next/link";
import {
  ClipboardCheckIcon,
  FileTextIcon,
  ScaleIcon,
  ShieldCheckIcon,
  SirenIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Governance landing — the entry point Astrolift's SECURE portal links to.
 * Deliberately a directory rather than a dashboard: it exists so an operator
 * arriving from Astrolift lands somewhere coherent and can reach every
 * governance surface in one hop.
 */
const SURFACES = [
  {
    href: "/policies",
    icon: ScaleIcon,
    title: "Policies",
    body: "Rules in force, their scope, and how they resolve for a given agent.",
  },
  {
    href: "/compliance",
    icon: ShieldCheckIcon,
    title: "Compliance",
    body: "Framework coverage, control mapping, and gap analysis.",
  },
  {
    href: "/risks",
    icon: TriangleAlertIcon,
    title: "Risk register",
    body: "Identified risks, scoring, and treatment status.",
  },
  {
    href: "/content-rules",
    icon: ClipboardCheckIcon,
    title: "Content rules",
    body: "Detection rules and what the scanner does when they match.",
  },
  {
    href: "/incidents",
    icon: SirenIcon,
    title: "Incidents",
    body: "Open and resolved incidents, with their timelines.",
  },
  {
    href: "/audit",
    icon: FileTextIcon,
    title: "Audit",
    body: "Tamper-evident audit chain and export for SIEM.",
  },
];

export default function GovernancePage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Governance</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Every control surface Zentinelle exposes over the agents it governs.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {SURFACES.map(({ href, icon: Icon, title, body }) => (
          <Link key={href} href={href} className="group">
            <Card className="h-full transition-colors group-hover:border-foreground/20">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="text-muted-foreground size-4" />
                  {title}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-sm">{body}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
