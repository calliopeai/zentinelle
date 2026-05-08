"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  FileTextIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  FileJsonIcon,
  ClipboardListIcon,
  BarChart3Icon,
  AlertTriangleIcon,
} from "lucide-react";
import { toast } from "sonner";

const REPORT_TYPES = [
  {
    id: "risk-assessment",
    name: "Risk Assessment Report",
    description: "Full inventory of open risks with scores, owners, and mitigation plans",
    icon: <ClipboardListIcon className="h-6 w-6" />,
  },
  {
    id: "executive-summary",
    name: "Executive Summary",
    description: "One-page overview for leadership: risk index, top risks, trends",
    icon: <BarChart3Icon className="h-6 w-6" />,
  },
  {
    id: "incident-report",
    name: "Incident Report",
    description: "Detailed breakdown of incidents, SLAs, root causes, resolution times",
    icon: <AlertTriangleIcon className="h-6 w-6" />,
  },
];

const FORMATS = [
  { id: "pdf", label: "PDF", icon: <FileTextIcon className="h-4 w-4" /> },
  { id: "csv", label: "CSV", icon: <FileSpreadsheetIcon className="h-4 w-4" /> },
  { id: "json", label: "JSON", icon: <FileJsonIcon className="h-4 w-4" /> },
];

export default function RiskReportsPage() {
  const [selectedType, setSelectedType] = useState("risk-assessment");
  const [selectedFormat, setSelectedFormat] = useState("pdf");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [generating, setGenerating] = useState(false);

  const handleGenerate = async () => {
    setGenerating(true);
    toast.info("Generating report...");
    await new Promise((r) => setTimeout(r, 2000));
    toast.success("Report generated successfully");
    setGenerating(false);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Risk Reports</h1>
        <p className="text-muted-foreground">
          Generate exportable risk assessment reports
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {REPORT_TYPES.map((type) => (
          <Card
            key={type.id}
            className={`cursor-pointer transition-all ${
              selectedType === type.id
                ? "border-primary ring-1 ring-primary/30"
                : "hover:border-primary/30"
            }`}
            onClick={() => setSelectedType(type.id)}
          >
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="text-primary">{type.icon}</div>
                <div>
                  <CardTitle className="text-sm">{type.name}</CardTitle>
                  <CardDescription className="text-xs mt-1">
                    {type.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-input bg-background flex h-10 w-full rounded-md border px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Format</label>
            <div className="flex gap-2">
              {FORMATS.map((fmt) => (
                <Button
                  key={fmt.id}
                  variant={selectedFormat === fmt.id ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedFormat(fmt.id)}
                  className="gap-2"
                >
                  {fmt.icon}
                  {fmt.label}
                </Button>
              ))}
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full md:w-auto"
          >
            <DownloadIcon className="mr-2 h-4 w-4" />
            {generating ? "Generating..." : "Generate Report"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
