"use client";

import { useState, useCallback, useMemo } from "react";
import { useMutation } from "@apollo/client/react";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PlusIcon,
  TrashIcon,
  ShieldCheckIcon,
  ShieldXIcon,
  LoaderIcon,
} from "lucide-react";
import { CREATE_POLICY, UPDATE_POLICY } from "@/graphql/policies/mutations";
import { usePolicies } from "@/graphql/policies/hooks";
import type {
  CreatePolicyPayload,
  UpdatePolicyPayload,
} from "@/graphql/policies/types";

interface CreatePolicyResult {
  createPolicy: CreatePolicyPayload;
}

interface UpdatePolicyResult {
  updatePolicy: UpdatePolicyPayload;
}

/* ── ListCard component (declared outside render) ──────────── */

function ListCard({
  title,
  description,
  icon,
  items,
  onAdd,
  onRemove,
  variant,
}: {
  title: string;
  description: string;
  icon: React.ReactNode;
  items: string[];
  onAdd: (value: string) => void;
  onRemove: (item: string) => void;
  variant: "allow" | "block";
}) {
  const [inputValue, setInputValue] = useState("");

  const handleAdd = () => {
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue("");
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm">
          {icon}
          {title}
          <Badge variant={variant === "allow" ? "default" : "destructive"}>
            {items.length}
          </Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
            placeholder={
              title.includes("Domain")
                ? "*.example.com"
                : "192.168.1.0/24"
            }
            className="border-input bg-background flex h-9 flex-1 rounded-md border px-3 text-sm"
          />
          <Button size="sm" variant="outline" onClick={handleAdd}>
            <PlusIcon className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.map((item) => (
            <Badge
              key={item}
              variant="outline"
              className="flex items-center gap-1 py-1"
            >
              <code className="text-xs">{item}</code>
              <button
                onClick={() => onRemove(item)}
                className="hover:text-destructive ml-1"
              >
                <TrashIcon className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {items.length === 0 && (
            <span className="text-muted-foreground text-xs">No entries</span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/* ── Helper: extract config from a policy's config JSON ────── */

function extractStringArray(
  cfg: Record<string, unknown> | null,
  key: string,
): string[] {
  if (!cfg) return [];
  const val = cfg[key];
  return Array.isArray(val) ? (val as string[]) : [];
}

/* ── Inner form (receives initial data as props) ───────────── */

function NetworkPolicyForm({
  initialAllowedDomains,
  initialBlockedDomains,
  initialAllowedIPs,
  initialBlockedIPs,
  policyId,
}: {
  initialAllowedDomains: string[];
  initialBlockedDomains: string[];
  initialAllowedIPs: string[];
  initialBlockedIPs: string[];
  policyId: string | null;
}) {
  const [allowedDomains, setAllowedDomains] = useState(initialAllowedDomains);
  const [blockedDomains, setBlockedDomains] = useState(initialBlockedDomains);
  const [allowedIPs, setAllowedIPs] = useState(initialAllowedIPs);
  const [blockedIPs, setBlockedIPs] = useState(initialBlockedIPs);
  const [existingPolicyId, setExistingPolicyId] = useState(policyId);
  const [saving, setSaving] = useState(false);

  const [createPolicy] = useMutation<CreatePolicyResult>(CREATE_POLICY);
  const [updatePolicy] = useMutation<UpdatePolicyResult>(UPDATE_POLICY);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const config = {
      allowed_domains: allowedDomains,
      blocked_domains: blockedDomains,
      allowed_ips: allowedIPs,
      blocked_ips: blockedIPs,
    };

    try {
      if (existingPolicyId) {
        const { data } = await updatePolicy({
          variables: {
            input: {
              id: existingPolicyId,
              config,
            },
          },
        });
        if (data?.updatePolicy?.success) {
          toast.success("Network policy updated");
        } else {
          toast.error("Failed to update policy", {
            description: data?.updatePolicy?.error || "Unknown error",
          });
        }
      } else {
        const { data } = await createPolicy({
          variables: {
            input: {
              name: "Network Policy",
              policyType: "network_policy",
              scopeType: "organization",
              enforcement: "enforce",
              config,
              enabled: true,
            },
          },
        });
        if (data?.createPolicy?.success) {
          setExistingPolicyId(data.createPolicy.policy?.id ?? null);
          toast.success("Network policy created");
        } else {
          toast.error("Failed to create policy", {
            description: data?.createPolicy?.error || "Unknown error",
          });
        }
      }
    } catch {
      toast.error("Failed to save network policy", {
        description: "An unexpected error occurred. Please try again.",
      });
    }
    setSaving(false);
  }, [allowedDomains, blockedDomains, allowedIPs, blockedIPs, existingPolicyId, createPolicy, updatePolicy]);

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Network Policies</h1>
          <p className="text-muted-foreground">
            Control which domains and IP ranges your agents can access
          </p>
        </div>
        {existingPolicyId && (
          <Badge variant="outline" className="text-xs">
            Policy loaded
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListCard
          title="Allowed Domains"
          description="Agents can only access these domains (wildcard supported)"
          icon={<ShieldCheckIcon className="h-4 w-4 text-green-500" />}
          items={allowedDomains}
          onAdd={(v) => setAllowedDomains((prev) => [...prev, v])}
          onRemove={(item) => setAllowedDomains((prev) => prev.filter((i) => i !== item))}
          variant="allow"
        />
        <ListCard
          title="Blocked Domains"
          description="Agents are denied access to these domains"
          icon={<ShieldXIcon className="h-4 w-4 text-red-500" />}
          items={blockedDomains}
          onAdd={(v) => setBlockedDomains((prev) => [...prev, v])}
          onRemove={(item) => setBlockedDomains((prev) => prev.filter((i) => i !== item))}
          variant="block"
        />
        <ListCard
          title="Allowed IPs / CIDRs"
          description="Restrict agent network access to these IP ranges"
          icon={<ShieldCheckIcon className="h-4 w-4 text-green-500" />}
          items={allowedIPs}
          onAdd={(v) => setAllowedIPs((prev) => [...prev, v])}
          onRemove={(item) => setAllowedIPs((prev) => prev.filter((i) => i !== item))}
          variant="allow"
        />
        <ListCard
          title="Blocked IPs / CIDRs"
          description="Deny agent access to these IP ranges"
          icon={<ShieldXIcon className="h-4 w-4 text-red-500" />}
          items={blockedIPs}
          onAdd={(v) => setBlockedIPs((prev) => [...prev, v])}
          onRemove={(item) => setBlockedIPs((prev) => prev.filter((i) => i !== item))}
          variant="block"
        />
      </div>

      <div className="flex justify-end">
        <Button
          className="bg-[#37efed] text-black hover:bg-[#37efed]/80"
          onClick={handleSave}
          disabled={saving}
        >
          {saving && <LoaderIcon className="mr-2 h-4 w-4 animate-spin" />}
          {existingPolicyId ? "Update Network Policy" : "Save as Network Policy"}
        </Button>
      </div>
    </div>
  );
}

/* ── Main page (data loader) ──────────────────────────────── */

export default function NetworkPoliciesPage() {
  const { policies, loading } = usePolicies({ policyType: "network_policy" });

  const initialData = useMemo(() => {
    if (policies.length === 0) {
      return {
        allowedDomains: [] as string[],
        blockedDomains: [] as string[],
        allowedIPs: [] as string[],
        blockedIPs: [] as string[],
        policyId: null as string | null,
      };
    }
    const policy = policies[0];
    const cfg = policy.config as Record<string, unknown> | null;
    return {
      allowedDomains: extractStringArray(cfg, "allowed_domains"),
      blockedDomains: extractStringArray(cfg, "blocked_domains"),
      allowedIPs: extractStringArray(cfg, "allowed_ips"),
      blockedIPs: extractStringArray(cfg, "blocked_ips"),
      policyId: policy.id,
    };
  }, [policies]);

  if (loading) {
    return (
      <div className="flex flex-col gap-6 p-6">
        <div>
          <Skeleton className="h-7 w-48" />
          <Skeleton className="mt-1 h-4 w-72" />
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-5 w-36" />
                <Skeleton className="h-3 w-64" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-9 w-full" />
                <div className="mt-3 flex gap-2">
                  <Skeleton className="h-6 w-24 rounded-full" />
                  <Skeleton className="h-6 w-28 rounded-full" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <NetworkPolicyForm
      key={initialData.policyId ?? "new"}
      initialAllowedDomains={initialData.allowedDomains}
      initialBlockedDomains={initialData.blockedDomains}
      initialAllowedIPs={initialData.allowedIPs}
      initialBlockedIPs={initialData.blockedIPs}
      policyId={initialData.policyId}
    />
  );
}
