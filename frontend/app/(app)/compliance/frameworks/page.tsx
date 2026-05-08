"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";

const FRAMEWORKS = [
  { id: "soc2", name: "SOC 2", description: "Trust Services Criteria for service organizations", controls: 12, region: "Global" },
  { id: "gdpr", name: "GDPR", description: "EU data protection and privacy regulation", controls: 8, region: "EU/EEA" },
  { id: "hipaa", name: "HIPAA", description: "US health information privacy and security", controls: 8, region: "US" },
  { id: "eu-ai-act", name: "EU AI Act", description: "Risk-based AI governance regulation", controls: 8, region: "EU" },
  { id: "nist", name: "NIST AI RMF", description: "Voluntary AI risk management framework", controls: 8, region: "Global" },
];

export default function FrameworksPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Compliance Frameworks</h1>
        <p className="text-muted-foreground">
          Select a framework to view detailed controls and Zentinelle coverage
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FRAMEWORKS.map((fw) => (
          <Link key={fw.id} href={`/compliance/${fw.id}`}>
            <Card className="cursor-pointer hover:border-primary/50 transition-colors h-full">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>{fw.name}</CardTitle>
                  <Badge variant="outline">{fw.region}</Badge>
                </div>
                <CardDescription>{fw.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-sm">
                    {fw.controls} controls mapped
                  </span>
                  <ArrowRightIcon className="h-4 w-4 text-muted-foreground" />
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
