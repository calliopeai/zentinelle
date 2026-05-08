"use client";

import { useState } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon, CopyIcon, CheckIcon } from "lucide-react";

import { CREATE_AGENT_ENDPOINT } from "@/graphql/agents/mutations";
import type { CreateAgentEndpointPayload } from "@/graphql/agents/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const AGENT_TYPES = [
  { value: "claude_code", label: "Claude Code" },
  { value: "codex", label: "Codex" },
  { value: "gemini", label: "Gemini" },
  { value: "calliope", label: "Calliope AI" },
  { value: "langchain", label: "LangChain" },
  { value: "langgraph", label: "LangGraph" },
  { value: "mcp", label: "MCP" },
  { value: "chat", label: "Chat" },
  { value: "custom", label: "Custom" },
];

const CAPABILITY_SUGGESTIONS = [
  "code_execution",
  "file_read",
  "file_write",
  "web_search",
  "shell_access",
  "api_calls",
  "data_analysis",
  "image_generation",
  "tool_use",
];

const agentSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  agentId: z
    .string()
    .min(2, "Agent ID must be at least 2 characters")
    .max(128)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/, "Must be a valid slug (lowercase, hyphens only)"),
  agentType: z.string().min(1, "Agent type is required"),
  capabilities: z.array(z.string()),
  metadata: z.string().optional().refine(
    (val) => {
      if (!val || val.trim() === "") return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Metadata must be valid JSON" }
  ),
});

type AgentFormValues = z.infer<typeof agentSchema>;

type RegisterAgentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRegistered: () => void;
};

export function RegisterAgentDialog({
  open,
  onOpenChange,
  onRegistered,
}: RegisterAgentDialogProps) {
  const [apiKey, setApiKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [createEndpoint, { loading: submitting }] = useMutation<{
    createAgentEndpoint: CreateAgentEndpointPayload;
  }>(CREATE_AGENT_ENDPOINT);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<AgentFormValues>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: "",
      agentId: "",
      agentType: "",
      capabilities: [],
      metadata: "",
    },
  });

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setApiKey(null);
      setCopied(false);
      reset();
    }
    onOpenChange(isOpen);
  };

  const handleCopy = async () => {
    if (apiKey) {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const onSubmit = async (values: AgentFormValues) => {
    try {
      let metadataObj = null;
      if (values.metadata && values.metadata.trim()) {
        metadataObj = JSON.parse(values.metadata);
      }

      const { data } = await createEndpoint({
        variables: {
          input: {
            name: values.name,
            agentId: values.agentId || null,
            agentType: values.agentType,
            capabilities: values.capabilities.length > 0 ? values.capabilities : null,
            metadata: metadataObj,
          },
        },
      });

      if (data?.createAgentEndpoint?.success) {
        toast.success(`Agent "${values.name}" registered`);
        if (data.createAgentEndpoint.apiKey) {
          setApiKey(data.createAgentEndpoint.apiKey);
        } else {
          handleClose(false);
        }
        onRegistered();
      } else {
        toast.error(data?.createAgentEndpoint?.error ?? "Failed to register agent");
      }
    } catch {
      toast.error("Failed to register agent");
    }
  };

  if (apiKey) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Agent API Key</DialogTitle>
            <DialogDescription>
              Copy the API key now. It will not be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="bg-muted flex items-center gap-2 rounded-md border p-3">
            <code className="flex-1 break-all font-mono text-sm">{apiKey}</code>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleCopy}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <CopyIcon className="h-4 w-4" />
              )}
            </Button>
          </div>
          <DialogFooter>
            <Button onClick={() => handleClose(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Register Agent</DialogTitle>
          <DialogDescription>
            Register a new agent endpoint. An API key will be generated for the agent.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">Name *</Label>
            <Input
              id="agent-name"
              placeholder="e.g. Production Code Assistant"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-id">Agent ID *</Label>
            <Input
              id="agent-id"
              placeholder="e.g. prod-code-assistant"
              className="font-mono"
              {...register("agentId")}
              aria-invalid={!!errors.agentId}
            />
            {errors.agentId && (
              <p className="text-destructive text-sm">{errors.agentId.message}</p>
            )}
            <p className="text-muted-foreground text-xs">
              Unique slug identifier. Lowercase letters, numbers, and hyphens only.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Agent Type *</Label>
            <Controller
              control={control}
              name="agentType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.agentType}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {AGENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.agentType && (
              <p className="text-destructive text-sm">{errors.agentType.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Capabilities</Label>
            <Controller
              control={control}
              name="capabilities"
              render={({ field }) => (
                <TagInput
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={CAPABILITY_SUGGESTIONS}
                  placeholder="Add capabilities..."
                />
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="agent-metadata">Metadata (JSON)</Label>
            <Textarea
              id="agent-metadata"
              placeholder='{"team": "backend", "environment": "production"}'
              className="font-mono text-sm"
              rows={4}
              {...register("metadata")}
              aria-invalid={!!errors.metadata}
            />
            {errors.metadata && (
              <p className="text-destructive text-sm">{errors.metadata.message}</p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              Register Agent
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
