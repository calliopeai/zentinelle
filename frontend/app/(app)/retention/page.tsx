"use client";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArchiveIcon, ShieldAlertIcon } from "lucide-react";

export default function RetentionPage() {
  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Data Retention</h1>
        <p className="text-muted-foreground">Manage data lifecycle policies and legal holds</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6 text-center">
            <ArchiveIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-2xl font-bold">90 days</div>
            <div className="text-muted-foreground text-sm">Event retention</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ArchiveIcon className="mx-auto h-8 w-8 text-muted-foreground" />
            <div className="mt-2 text-2xl font-bold">365 days</div>
            <div className="text-muted-foreground text-sm">Audit log retention</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6 text-center">
            <ShieldAlertIcon className="mx-auto h-8 w-8 text-yellow-500" />
            <div className="mt-2 text-2xl font-bold">0</div>
            <div className="text-muted-foreground text-sm">Active legal holds</div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Retention Policies</CardTitle>
          <CardDescription>Configure how long different data types are retained</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Configure retention via Policies → Data Retention policy type.</p>
        </CardContent>
      </Card>
    </div>
  );
}
