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
  GlobeIcon,
  PlusIcon,
  TrashIcon,
  ShieldCheckIcon,
  ShieldXIcon,
} from "lucide-react";

export default function NetworkPoliciesPage() {
  const [allowedDomains, setAllowedDomains] = useState([
    "*.openai.com",
    "*.anthropic.com",
    "*.googleapis.com",
    "*.github.com",
  ]);
  const [blockedDomains, setBlockedDomains] = useState([
    "*.torproject.org",
    "paste*.com",
  ]);
  const [allowedIPs, setAllowedIPs] = useState(["10.0.0.0/8", "172.16.0.0/12"]);
  const [blockedIPs, setBlockedIPs] = useState<string[]>([]);
  const [newItem, setNewItem] = useState("");

  const addItem = (
    list: string[],
    setList: (v: string[]) => void,
  ) => {
    if (newItem.trim() && !list.includes(newItem.trim())) {
      setList([...list, newItem.trim()]);
      setNewItem("");
    }
  };

  const removeItem = (
    list: string[],
    setList: (v: string[]) => void,
    item: string,
  ) => {
    setList(list.filter((i) => i !== item));
  };

  const ListCard = ({
    title,
    description,
    icon,
    items,
    setItems,
    variant,
  }: {
    title: string;
    description: string;
    icon: React.ReactNode;
    items: string[];
    setItems: (v: string[]) => void;
    variant: "allow" | "block";
  }) => (
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
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addItem(items, setItems)}
            placeholder={
              title.includes("Domain")
                ? "*.example.com"
                : "192.168.1.0/24"
            }
            className="border-input bg-background flex h-9 flex-1 rounded-md border px-3 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => addItem(items, setItems)}
          >
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
                onClick={() => removeItem(items, setItems, item)}
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

  return (
    <div className="flex flex-col gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Network Policies</h1>
        <p className="text-muted-foreground">
          Control which domains and IP ranges your agents can access
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ListCard
          title="Allowed Domains"
          description="Agents can only access these domains (wildcard supported)"
          icon={<ShieldCheckIcon className="h-4 w-4 text-green-500" />}
          items={allowedDomains}
          setItems={setAllowedDomains}
          variant="allow"
        />
        <ListCard
          title="Blocked Domains"
          description="Agents are denied access to these domains"
          icon={<ShieldXIcon className="h-4 w-4 text-red-500" />}
          items={blockedDomains}
          setItems={setBlockedDomains}
          variant="block"
        />
        <ListCard
          title="Allowed IPs / CIDRs"
          description="Restrict agent network access to these IP ranges"
          icon={<ShieldCheckIcon className="h-4 w-4 text-green-500" />}
          items={allowedIPs}
          setItems={setAllowedIPs}
          variant="allow"
        />
        <ListCard
          title="Blocked IPs / CIDRs"
          description="Deny agent access to these IP ranges"
          icon={<ShieldXIcon className="h-4 w-4 text-red-500" />}
          items={blockedIPs}
          setItems={setBlockedIPs}
          variant="block"
        />
      </div>

      <div className="flex justify-end">
        <Button className="bg-[#37efed] text-black hover:bg-[#37efed]/80">
          Save as Network Policy
        </Button>
      </div>
    </div>
  );
}
