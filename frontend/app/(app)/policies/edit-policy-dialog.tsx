"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { usePolicyOptions } from "@/graphql/policies/hooks";
import { UPDATE_POLICY } from "@/graphql/policies/mutations";
import type { PolicyData, UpdatePolicyPayload } from "@/graphql/policies/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

const editPolicySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  description: z.string().optional(),
  enforcement: z.string().optional(),
  config: z.string().optional().refine(
    (val) => {
      if (!val || val.trim() === "") return true;
      try {
        JSON.parse(val);
        return true;
      } catch {
        return false;
      }
    },
    { message: "Config must be valid JSON" }
  ),
  enabled: z.boolean(),
  priority: z.number().int().min(0).max(1000),
});

type EditPolicyValues = z.infer<typeof editPolicySchema>;

type EditPolicyDialogProps = {
  policy: PolicyData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function EditPolicyDialog({
  policy,
  open,
  onOpenChange,
  onSaved,
}: EditPolicyDialogProps) {
  const { options } = usePolicyOptions();
  const [updatePolicy, { loading: submitting }] = useMutation<{
    updatePolicy: UpdatePolicyPayload;
  }>(UPDATE_POLICY);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<EditPolicyValues>({
    resolver: zodResolver(editPolicySchema),
    defaultValues: {
      name: "",
      description: "",
      enforcement: "enforce",
      config: "",
      enabled: true,
      priority: 0,
    },
  });

  useEffect(() => {
    if (policy && open) {
      reset({
        name: policy.name,
        description: policy.description || "",
        enforcement: policy.enforcement,
        config: policy.config ? JSON.stringify(policy.config, null, 2) : "",
        enabled: policy.enabled,
        priority: policy.priority,
      });
    }
  }, [policy, open, reset]);

  const onSubmit = async (values: EditPolicyValues) => {
    if (!policy) return;

    try {
      let configObj = null;
      if (values.config && values.config.trim()) {
        configObj = JSON.parse(values.config);
      }

      const { data } = await updatePolicy({
        variables: {
          input: {
            id: policy.id,
            name: values.name,
            description: values.description || null,
            enforcement: values.enforcement || null,
            config: configObj,
            enabled: values.enabled,
            priority: values.priority,
          },
        },
      });

      if (data?.updatePolicy?.success) {
        toast.success(`Policy "${values.name}" updated`);
        onOpenChange(false);
        onSaved();
      } else {
        toast.error(data?.updatePolicy?.error ?? "Failed to update policy");
      }
    } catch {
      toast.error("Failed to update policy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Policy</DialogTitle>
          <DialogDescription>
            Update the policy configuration. Type and scope cannot be changed after creation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name *</Label>
            <Input id="edit-name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" {...register("description")} rows={2} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Enforcement</Label>
              <Controller
                control={control}
                name="enforcement"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select enforcement" />
                    </SelectTrigger>
                    <SelectContent>
                      {options?.enforcementLevels.map((el) => (
                        <SelectItem key={el.value!} value={el.value!}>
                          {el.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="edit-priority">Priority</Label>
              <Input
                id="edit-priority"
                type="number"
                min={0}
                max={1000}
                {...register("priority", { valueAsNumber: true })}
                aria-invalid={!!errors.priority}
              />
              {errors.priority && (
                <p className="text-destructive text-sm">{errors.priority.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-config">Config (JSON)</Label>
            <Textarea
              id="edit-config"
              className="font-mono text-sm"
              rows={5}
              {...register("config")}
              aria-invalid={!!errors.config}
            />
            {errors.config && (
              <p className="text-destructive text-sm">{errors.config.message}</p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Controller
              control={control}
              name="enabled"
              render={({ field }) => (
                <Switch
                  id="edit-enabled"
                  checked={field.value}
                  onCheckedChange={field.onChange}
                />
              )}
            />
            <Label htmlFor="edit-enabled">Enabled</Label>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
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
