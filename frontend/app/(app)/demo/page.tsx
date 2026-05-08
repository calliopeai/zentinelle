"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { PlayIcon, SparklesIcon } from "lucide-react";
import { startDemoTour } from "@/components/DemoTour";

const HIGHLIGHTS = [
  { label: "Real-time agent fleet health" },
  { label: "24 policy types × 5 inheritance scopes" },
  { label: "FMEA risk register with RPN scoring" },
  { label: "SOC 2 / GDPR / HIPAA / EU AI Act / NIST mapping" },
  { label: "Tamper-evident audit log" },
  { label: "AI assistant with 22 tools wired into your data" },
];

export default function DemoLandingPage() {
  const router = useRouter();

  // Auto-start if URL has ?autostart=1
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("autostart") === "1") {
      startDemoTour();
      router.push("/dashboard");
    }
  }, [router]);

  const handleStart = () => {
    startDemoTour();
    // Hard navigate so the (app) layout fully remounts and the DemoTour
    // mounted there picks up the active flag from sessionStorage.
    window.location.href = "/dashboard";
  };

  return (
    <div className="min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-2xl w-full space-y-6">
        <div className="flex items-center gap-2 justify-center">
          <SparklesIcon className="size-5 text-primary" />
          <span className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Live interactive demo
          </span>
        </div>

        <h1 className="text-4xl font-semibold tracking-tight text-center">
          See Zentinelle in 90 seconds.
        </h1>

        <p className="text-center text-muted-foreground max-w-xl mx-auto">
          A guided click-through of the platform — running against real
          seeded data. Your changes are sandboxed; reset at any time.
        </p>

        <Card className="border-primary/20">
          <CardContent className="pt-6 pb-4">
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
              {HIGHLIGHTS.map((h) => (
                <li key={h.label} className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-primary mt-2 shrink-0" />
                  <span>{h.label}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="flex justify-center gap-2">
          <Button size="lg" onClick={handleStart} className="gap-2">
            <PlayIcon className="size-4" />
            Start tour
          </Button>
          <Button size="lg" variant="outline" asChild>
            <a href="/dashboard">Skip — let me explore</a>
          </Button>
        </div>

        <p className="text-center text-xs text-muted-foreground">
          You can restart the tour any time from this page.
        </p>
      </div>
    </div>
  );
}
