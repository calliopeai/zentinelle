"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { UPDATE_AGENT_ENDPOINT } from "@/graphql/agents/mutations";
import type {
  EndpointData,
  UpdateAgentEndpointPayload,
} from "@/graphql/agents/types";

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

const editSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  agentType: z.string().min(1, "Agent type is required"),
  capabilities: z.array(z.string()),
  metadata: z.string().optional().refine(
    (val) => {
      if (!val || val.trim() === "") return true;
      try {
        const parsed = JSON.parse(val);
        return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed);
      } catch {
        return false;
      }
    },
    { message: "Metadata must be a valid JSON object" }
  ),
});

type EditFormValues = z.infer<typeof editSchema>;

type EditAgentDialogProps = {
  agent: EndpointData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
};

function formatMetadata(metadata: Record<string, unknown> | null): string {
  if (!metadata || Object.keys(metadata).length === 0) return "";
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return "";
  }
}

export function EditAgentDialog({
  agent,
  open,
  onOpenChange,
  onUpdated,
}: EditAgentDialogProps) {
  const [updateEndpoint, { loading: submitting }] = useMutation<{
    updateAgentEndpoint: UpdateAgentEndpointPayload;
  }>(UPDATE_AGENT_ENDPOINT);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EditFormValues>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      name: "",
      agentType: "",
      capabilities: [],
      metadata: "",
    },
  });

  useEffect(() => {
    if (open && agent) {
      reset({
        name: agent.name ?? "",
        agentType: agent.agentType ?? "",
        capabilities: agent.capabilities ?? [],
        metadata: formatMetadata(agent.metadata),
      });
    }
  }, [open, agent, reset]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const onSubmit = async (values: EditFormValues) => {
    if (!agent) return;

    let metadataObj: Record<string, unknown> | null = null;
    if (values.metadata && values.metadata.trim()) {
      try {
        metadataObj = JSON.parse(values.metadata);
      } catch {
        toast.error("Metadata must be valid JSON");
        return;
      }
    }

    try {
      const { data } = await updateEndpoint({
        variables: {
          input: {
            id: agent.id,
            name: values.name,
            agentType: values.agentType,
            capabilities: values.capabilities,
            metadata: metadataObj,
          },
        },
      });

      if (data?.updateAgentEndpoint?.success) {
        toast.success(`Agent "${values.name}" updated`);
        onUpdated();
        handleClose(false);
      } else {
        toast.error(data?.updateAgentEndpoint?.error ?? "Failed to update agent");
      }
    } catch {
      toast.error("Failed to update agent");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Agent</DialogTitle>
          <DialogDescription>
            Update this agent endpoint&apos;s name, type, capabilities, and metadata.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-agent-id-display">Agent ID</Label>
            <Input
              id="edit-agent-id-display"
              value={agent?.agentId ?? ""}
              readOnly
              disabled
              className="font-mono"
            />
            <p className="text-muted-foreground text-xs">
              Agent ID is immutable and cannot be changed after registration.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-agent-name">Name *</Label>
            <Input
              id="edit-agent-name"
              placeholder="e.g. Production Code Assistant"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
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
            <Label htmlFor="edit-agent-metadata">Metadata (JSON)</Label>
            <Textarea
              id="edit-agent-metadata"
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
              Save Changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
