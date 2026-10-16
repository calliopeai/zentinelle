"use client";

import { use } from "react";
import { ArrowLeftIcon, ShieldCheckIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { FRAMEWORK_PAGES } from "@/lib/compliance-frameworks";

export default function FrameworkDetailPage({
  params,
}: {
  params: Promise<{ framework: string }>;
}) {
  const { framework } = use(params);
  const data = Object.hasOwn(FRAMEWORK_PAGES, framework)
    ? FRAMEWORK_PAGES[framework]
    : undefined;

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

      {/* Nothing assesses this framework control by control yet, so the page
          shows no control status rather than a fixed one. */}
      <div className="text-muted-foreground rounded-lg border border-dashed p-10 text-center text-sm">
        <ShieldCheckIcon className="mx-auto mb-3 h-6 w-6" />
        <p className="text-foreground font-medium">
          Control coverage is not computed yet
        </p>
        <p className="mt-1">
          The{" "}
          <Link href="/compliance" className="text-primary hover:underline">
            Compliance
          </Link>{" "}
          page shows which of the capabilities {data.name} requires are enabled.
        </p>
      </div>
    </div>
  );
}
