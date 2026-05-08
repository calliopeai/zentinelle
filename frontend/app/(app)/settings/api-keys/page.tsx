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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  KeyIcon,
  PlusIcon,
  TrashIcon,
  CopyIcon,
  CheckIcon,
  ShieldAlertIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/hooks/use-confirm";
import {
  useApiKeys,
  useCreatePlatformApiKey,
  useRevokeApiKey,
  useDeleteApiKey,
} from "@/graphql/api-keys/hooks";

const SCOPES = [
  { value: "agents:read", label: "Read Agents" },
  { value: "agents:write", label: "Write Agents" },
  { value: "policies:read", label: "Read Policies" },
  { value: "policies:write", label: "Write Policies" },
  { value: "events:write", label: "Submit Events" },
  { value: "audit:read", label: "Read Audit Logs" },
  { value: "*", label: "Full Access (Admin)" },
];

export default function ApiKeysPage() {
  const { keys, loading } = useApiKeys();
  const [createKey] = useCreatePlatformApiKey();
  const [revokeKey] = useRevokeApiKey();
  const [deleteKey] = useDeleteApiKey();

  const [showCreate, setShowCreate] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [selectedScopes, setSelectedScopes] = useState<Set<string>>(new Set(["agents:read"]));
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCreate = async () => {
    if (!keyName.trim()) {
      toast.error("Name is required");
      return;
    }
    try {
      const result: any = await createKey({
        variables: {
          name: keyName.trim(),
          scopes: Array.from(selectedScopes),
        },
      });
      const plaintext = result?.data?.createPlatformApiKey?.plaintextKey;
      if (plaintext) {
        setCreatedKey(plaintext);
      }
      toast.success("API key created");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to create key");
    }
  };

  const handleCopy = () => {
    if (createdKey) {
      navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const confirmDialog = useConfirm();

  const handleRevoke = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: `Revoke "${name}"?`,
      description:
        "This API key will stop working immediately. Existing tokens cannot be reissued.",
      confirmLabel: "Revoke",
    });
    if (!ok) return;
    try {
      await revokeKey({ variables: { id } });
      toast.success("Key revoked");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to revoke");
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const ok = await confirmDialog({
      title: `Delete "${name}"?`,
      description:
        "This permanently removes the API key record. This cannot be undone.",
      confirmLabel: "Delete",
    });
    if (!ok) return;
    try {
      await deleteKey({ variables: { id } });
      toast.success("Key deleted");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to delete");
    }
  };

  const closeDialog = () => {
    setShowCreate(false);
    setKeyName("");
    setSelectedScopes(new Set(["agents:read"]));
    setCreatedKey(null);
    setCopied(false);
  };

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">API Keys</h1>
          <p className="text-muted-foreground">
            Platform API keys for programmatic access to Zentinelle
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <PlusIcon className="mr-2 h-4 w-4" />
          Create Key
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldAlertIcon className="h-4 w-4 text-yellow-500" />
            Security Notice
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            API keys grant programmatic access to your tenant. Treat them like passwords.
            Keys are shown only once at creation — store them securely. Rotate regularly and
            revoke unused keys.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Active Keys</CardTitle>
          <CardDescription>{keys.length} keys</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-center py-8 text-sm">Loading...</p>
          ) : keys.length === 0 ? (
            <div className="text-center py-12">
              <KeyIcon className="text-muted-foreground mx-auto h-12 w-12" />
              <p className="text-muted-foreground mt-4 text-sm">No API keys yet</p>
              <Button className="mt-4" onClick={() => setShowCreate(true)}>
                <PlusIcon className="mr-2 h-4 w-4" />
                Create your first key
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-3 px-2 font-medium">Name</th>
                    <th className="text-left py-3 px-2 font-medium">Prefix</th>
                    <th className="text-left py-3 px-2 font-medium">Scopes</th>
                    <th className="text-left py-3 px-2 font-medium">Status</th>
                    <th className="text-left py-3 px-2 font-medium">Last Used</th>
                    <th className="text-right py-3 px-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.id} className="border-b last:border-0">
                      <td className="py-3 px-2 font-medium">{key.name}</td>
                      <td className="py-3 px-2 font-mono text-xs">
                        {key.keyPrefix}…
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex flex-wrap gap-1">
                          {key.scopes?.map((s) => (
                            <Badge key={s} variant="outline" className="text-xs">
                              {s}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          className={
                            key.status === "active"
                              ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                              : "bg-red-500/15 text-red-500 border-red-500/30"
                          }
                        >
                          {key.status}
                        </Badge>
                      </td>
                      <td className="py-3 px-2 text-muted-foreground text-xs">
                        {key.lastUsedAt
                          ? new Date(key.lastUsedAt).toLocaleDateString()
                          : "Never"}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {key.status === "active" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevoke(key.id, key.name)}
                          >
                            Revoke
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(key.id, key.name)}
                        >
                          <TrashIcon className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={showCreate} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent>
          {createdKey ? (
            <>
              <DialogHeader>
                <DialogTitle>API Key Created</DialogTitle>
                <DialogDescription>
                  Save this key now — it won&apos;t be shown again.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="bg-muted rounded-md p-3 font-mono text-xs break-all">
                  {createdKey}
                </div>
                <Button onClick={handleCopy} variant="outline" className="w-full">
                  {copied ? (
                    <>
                      <CheckIcon className="mr-2 h-4 w-4" /> Copied
                    </>
                  ) : (
                    <>
                      <CopyIcon className="mr-2 h-4 w-4" /> Copy to clipboard
                    </>
                  )}
                </Button>
              </div>
              <DialogFooter>
                <Button onClick={closeDialog}>Done</Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Create API Key</DialogTitle>
                <DialogDescription>
                  Generate a new platform API key with specific scopes.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Name</label>
                  <input
                    type="text"
                    value={keyName}
                    onChange={(e) => setKeyName(e.target.value)}
                    placeholder="e.g. CI/CD pipeline"
                    className="border-input bg-background flex h-10 w-full rounded-md border px-3 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scopes</label>
                  <div className="space-y-2">
                    {SCOPES.map((scope) => (
                      <label
                        key={scope.value}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedScopes.has(scope.value)}
                          onChange={(e) => {
                            const next = new Set(selectedScopes);
                            if (e.target.checked) {
                              next.add(scope.value);
                            } else {
                              next.delete(scope.value);
                            }
                            setSelectedScopes(next);
                          }}
                        />
                        <span className="text-sm">{scope.label}</span>
                        <code className="text-muted-foreground text-xs">
                          {scope.value}
                        </code>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button onClick={handleCreate}>Create Key</Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
