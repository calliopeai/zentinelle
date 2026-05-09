"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import {
  CREATE_AGENT_GROUP,
  UPDATE_AGENT_GROUP,
} from "@/graphql/agent-groups/mutations";
import type {
  AgentGroupData,
  CreateAgentGroupPayload,
  UpdateAgentGroupPayload,
} from "@/graphql/agent-groups/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

const TIERS = [
  {
    value: "standard",
    label: "Standard",
    description: "Default enforcement profile.",
  },
  {
    value: "restricted",
    label: "Restricted",
    description: "Stricter posture — block-mode defaults.",
  },
  {
    value: "trusted",
    label: "Trusted",
    description: "Relaxed posture — audit-mode defaults.",
  },
];

const COLOR_PRESETS = [
  { value: "brand", label: "Brand", swatch: "#37efed" },
  { value: "indigo", label: "Indigo", swatch: "#6366f1" },
  { value: "emerald", label: "Emerald", swatch: "#10b981" },
  { value: "amber", label: "Amber", swatch: "#f59e0b" },
  { value: "rose", label: "Rose", swatch: "#f43f5e" },
  { value: "violet", label: "Violet", swatch: "#8b5cf6" },
  { value: "slate", label: "Slate", swatch: "#64748b" },
];

const groupSchema = z.object({
  name: z
    .string()
    .min(2, "Name must be at least 2 characters")
    .max(255, "Name must be at most 255 characters"),
  description: z.string().max(2000).optional(),
  tier: z.string().min(1, "Tier is required"),
  color: z.string().min(1, "Color is required"),
});

type GroupFormValues = z.infer<typeof groupSchema>;

const DEFAULT_VALUES: GroupFormValues = {
  name: "",
  description: "",
  tier: "standard",
  color: "brand",
};

type GroupDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editGroup?: AgentGroupData | null;
};

export function GroupDialog({
  open,
  onOpenChange,
  onSaved,
  editGroup,
}: GroupDialogProps) {
  const isEdit = !!editGroup;

  const [createGroup, { loading: creating }] = useMutation<{
    createAgentGroup: CreateAgentGroupPayload;
  }>(CREATE_AGENT_GROUP);
  const [updateGroup, { loading: updating }] = useMutation<{
    updateAgentGroup: UpdateAgentGroupPayload;
  }>(UPDATE_AGENT_GROUP);
  const submitting = creating || updating;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<GroupFormValues>({
    resolver: zodResolver(groupSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (editGroup) {
      reset({
        name: editGroup.name,
        description: editGroup.description ?? "",
        tier: editGroup.tier,
        color: editGroup.color,
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [open, editGroup, reset]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset(DEFAULT_VALUES);
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (values: GroupFormValues) => {
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() ?? "",
      tier: values.tier,
      color: values.color,
    };

    try {
      if (isEdit) {
        const { data } = await updateGroup({
          variables: { id: editGroup!.id, ...payload },
        });
        if (data?.updateAgentGroup?.group) {
          toast.success(`Group "${payload.name}" updated`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.updateAgentGroup?.errors?.[0] ?? "Failed to update group"
          );
        }
      } else {
        const { data } = await createGroup({ variables: payload });
        if (data?.createAgentGroup?.group) {
          toast.success(`Group "${payload.name}" created`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.createAgentGroup?.errors?.[0] ?? "Failed to create group"
          );
        }
      }
    } catch {
      toast.error(isEdit ? "Failed to update group" : "Failed to create group");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Agent Group" : "Create Agent Group"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the group's metadata and posture tier."
              : "Group agents to apply common policy defaults and visualize fleet posture."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Name *</Label>
            <Input
              id="group-name"
              placeholder="e.g. Production Agents"
              autoFocus
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="group-desc">Description</Label>
            <Textarea
              id="group-desc"
              placeholder="What kind of agents belong to this group?"
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Tier *</Label>
              <Controller
                control={control}
                name="tier"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.tier}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TIERS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          <div className="flex flex-col">
                            <span>{t.label}</span>
                            <span className="text-muted-foreground text-xs">
                              {t.description}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.tier && (
                <p className="text-destructive text-sm">
                  {errors.tier.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Color *</Label>
              <Controller
                control={control}
                name="color"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.color}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COLOR_PRESETS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          <span className="flex items-center gap-2">
                            <span
                              className="inline-block size-3 rounded-sm border"
                              style={{ backgroundColor: c.swatch }}
                            />
                            {c.label}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.color && (
                <p className="text-destructive text-sm">
                  {errors.color.message}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleClose(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              )}
              {isEdit ? "Save Changes" : "Create Group"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
