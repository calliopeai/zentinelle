"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  KeyIcon,
  CopyIcon,
  TrashIcon,
  PlusIcon,
  GlobeIcon,
  BellIcon,
  BuildingIcon,
  PaletteIcon,
} from "lucide-react";
import { toast } from "sonner";

interface BootstrapToken {
  id: string;
  prefix: string;
  createdAt: string;
}

export default function SettingsPage() {
  const [orgName, setOrgName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [slackUrl, setSlackUrl] = useState("");
  const [tokens, setTokens] = useState<BootstrapToken[]>([]);
  const [newToken, setNewToken] = useState<string | null>(null);

  const handleGenerateToken = () => {
    const token = `ztk_${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const newEntry: BootstrapToken = {
      id: Math.random().toString(36).substring(2, 9),
      prefix: token.substring(0, 12) + "...",
      createdAt: new Date().toISOString(),
    };
    setTokens((prev) => [...prev, newEntry]);
    setNewToken(token);
    toast.success("Bootstrap token generated");
  };

  const handleCopyToken = () => {
    if (newToken) {
      navigator.clipboard.writeText(newToken);
      toast.success("Token copied to clipboard");
    }
  };

  const handleRevokeToken = (id: string) => {
    setTokens((prev) => prev.filter((t) => t.id !== id));
    toast.success("Token revoked");
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Configure your organization and portal preferences
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BuildingIcon className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-base">Organization</CardTitle>
          </div>
          <CardDescription>
            Basic organization settings and contact information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization Name</Label>
              <Input
                id="org-name"
                placeholder="Your organization"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact-email">Contact Email</Label>
              <Input
                id="contact-email"
                type="email"
                placeholder="admin@example.com"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="timezone">Timezone</Label>
              <Input
                id="timezone"
                placeholder="America/New_York"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <BellIcon className="text-muted-foreground h-4 w-4" />
            <CardTitle className="text-base">Notifications</CardTitle>
          </div>
          <CardDescription>
            Configure webhook and Slack integrations for alerts
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="webhook-url">Webhook URL</Label>
              <Input
                id="webhook-url"
                type="url"
                placeholder="https://example.com/webhook"
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slack-url">Slack Webhook URL</Label>
              <Input
                id="slack-url"
                type="url"
                placeholder="https://hooks.slack.com/..."
                value={slackUrl}
                onChange={(e) => setSlackUrl(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <KeyIcon className="text-muted-foreground h-4 w-4" />
                <CardTitle className="text-base">Bootstrap Tokens</CardTitle>
              </div>
              <CardDescription className="mt-1">
                Generate tokens for agent registration and API access
              </CardDescription>
            </div>
            <Button size="sm" onClick={handleGenerateToken}>
              <PlusIcon className="mr-1 h-4 w-4" />
              Generate Token
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {newToken && (
            <div className="bg-muted mb-4 flex items-center gap-2 rounded-lg border p-3">
              <code className="flex-1 truncate text-xs">{newToken}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCopyToken}
              >
                <CopyIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
          {tokens.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              No active bootstrap tokens
            </p>
          ) : (
            <div className="space-y-2">
              {tokens.map((token) => (
                <div
                  key={token.id}
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <KeyIcon className="text-muted-foreground h-4 w-4" />
                    <div>
                      <code className="text-xs font-medium">{token.prefix}</code>
                      <p className="text-muted-foreground text-xs">
                        Created {new Date(token.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-red-500 hover:text-red-600"
                    onClick={() => handleRevokeToken(token.id)}
                  >
                    <TrashIcon className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <GlobeIcon className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">Language</h2>
          </div>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Choose your preferred language
          </p>
        </div>
        <div className="col-span-full md:col-span-2">
          <LanguageSwitcher variant="select" />
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <PaletteIcon className="text-muted-foreground h-4 w-4" />
            <h2 className="text-sm font-medium">Theme</h2>
          </div>
          <p className="text-muted-foreground mt-1 text-sm">
            Switch between light and dark mode
          </p>
        </div>
        <div className="col-span-full md:col-span-2">
          <ThemeToggle variant="select" />
        </div>
      </div>
    </div>
  );
}
