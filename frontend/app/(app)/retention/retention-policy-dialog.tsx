"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import {
  CREATE_RETENTION_POLICY,
  UPDATE_RETENTION_POLICY,
} from "@/graphql/retention/mutations";

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

export type RetentionPolicyEditData = {
  id: string;
  name: string;
  description: string | null;
  entityType: string;
  retentionDays: number;
  minimumRetentionDays: number | null;
  expirationAction: string;
  complianceRequirement: string | null;
  enabled: boolean;
  priority: number;
};

const ENTITY_TYPES = [
  { value: "all", label: "All Data" },
  { value: "events", label: "Telemetry Events" },
  { value: "interactions", label: "AI Interactions" },
  { value: "scans", label: "Content Scans" },
  { value: "audit_logs", label: "Audit Logs" },
  { value: "sessions", label: "User Sessions" },
  { value: "secrets", label: "Secret Access Logs" },
  { value: "usage_data", label: "Usage / Billing Data" },
];

const EXPIRATION_ACTIONS = [
  { value: "delete", label: "Permanently Delete" },
  { value: "anonymize", label: "Anonymize / Pseudonymize" },
  { value: "archive", label: "Archive to Cold Storage" },
  { value: "flag", label: "Flag for Review" },
];

const COMPLIANCE_OPTIONS = [
  { value: "none", label: "No Specific Requirement" },
  { value: "gdpr", label: "GDPR (Right to Erasure)" },
  { value: "ccpa", label: "CCPA (Data Deletion)" },
  { value: "hipaa", label: "HIPAA (6 Year Minimum)" },
  { value: "sox", label: "SOX (7 Year Minimum)" },
  { value: "pci_dss", label: "PCI-DSS (1 Year)" },
  { value: "soc2", label: "SOC 2" },
  { value: "custom", label: "Custom Policy" },
];

const optionalIntFromInput = z
  .preprocess((val) => {
    if (val === "" || val === null || val === undefined) return undefined;
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isNaN(n) ? val : n;
    }
    return val;
  }, z.number().int("Must be a whole number").min(0, "Cannot be negative").max(36500, "Must be 36500 days or less").optional());

const retentionDaysFromInput = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isNaN(n) ? val : n;
    }
    return val;
  },
  z
    .number({ message: "Retention days must be a number" })
    .int("Must be a whole number")
    .min(1, "Must be at least 1 day")
    .max(36500, "Must be 36500 days or less"),
);

const priorityFromInput = z.preprocess(
  (val) => {
    if (val === "" || val === null || val === undefined) return 0;
    if (typeof val === "string") {
      const n = Number(val);
      return Number.isNaN(n) ? val : n;
    }
    return val;
  },
  z
    .number({ message: "Priority must be a number" })
    .int("Must be a whole number")
    .min(0, "Cannot be negative")
    .max(1000, "Must be 1000 or less"),
);

const retentionPolicySchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    description: z.string().optional(),
    entityType: z.string().min(1, "Entity type is required"),
    retentionDays: retentionDaysFromInput,
    minimumRetentionDays: optionalIntFromInput,
    expirationAction: z.string().min(1, "Expiration action is required"),
    complianceRequirement: z.string(),
    enabled: z.boolean(),
    priority: priorityFromInput,
  })
  .refine(
    (val) => {
      if (val.minimumRetentionDays === undefined) return true;
      return val.minimumRetentionDays <= val.retentionDays;
    },
    {
      message: "Minimum retention cannot exceed retention days",
      path: ["minimumRetentionDays"],
    },
  );

type RetentionPolicyFormValues = z.infer<typeof retentionPolicySchema>;
type RetentionPolicyFormInput = z.input<typeof retentionPolicySchema>;

type MutationPayload = {
  success: boolean | null;
  policyId: string | null;
  errors: string[];
};

type RetentionPolicyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editPolicy?: RetentionPolicyEditData | null;
};

const DEFAULT_VALUES: RetentionPolicyFormInput = {
  name: "",
  description: "",
  entityType: "",
  retentionDays: 90,
  minimumRetentionDays: undefined,
  expirationAction: "delete",
  complianceRequirement: "none",
  enabled: true,
  priority: 0,
};

export function RetentionPolicyDialog({
  open,
  onOpenChange,
  onSaved,
  editPolicy,
}: RetentionPolicyDialogProps) {
  const isEdit = !!editPolicy;

  const [createPolicy, { loading: creating }] = useMutation<{
    createRetentionPolicy: MutationPayload;
  }>(CREATE_RETENTION_POLICY);
  const [updatePolicy, { loading: updating }] = useMutation<{
    updateRetentionPolicy: MutationPayload;
  }>(UPDATE_RETENTION_POLICY);
  const submitting = creating || updating;

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<RetentionPolicyFormInput, unknown, RetentionPolicyFormValues>({
    resolver: zodResolver(retentionPolicySchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    if (editPolicy) {
      reset({
        name: editPolicy.name,
        description: editPolicy.description ?? "",
        entityType: editPolicy.entityType,
        retentionDays: editPolicy.retentionDays,
        minimumRetentionDays:
          editPolicy.minimumRetentionDays ?? undefined,
        expirationAction: editPolicy.expirationAction,
        complianceRequirement: editPolicy.complianceRequirement ?? "none",
        enabled: editPolicy.enabled,
        priority: editPolicy.priority,
      });
    } else {
      reset(DEFAULT_VALUES);
    }
  }, [open, editPolicy, reset]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset(DEFAULT_VALUES);
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (values: RetentionPolicyFormValues) => {
    const minRetention =
      values.minimumRetentionDays === undefined ||
      values.minimumRetentionDays === null ||
      Number.isNaN(values.minimumRetentionDays)
        ? null
        : Number(values.minimumRetentionDays);

    const payload = {
      name: values.name,
      description: values.description?.trim() || null,
      entityType: values.entityType,
      retentionDays: Number(values.retentionDays),
      minimumRetentionDays: minRetention,
      expirationAction: values.expirationAction,
      complianceRequirement: values.complianceRequirement || "none",
      enabled: values.enabled,
      priority: Number(values.priority),
    };

    try {
      if (isEdit) {
        const { data } = await updatePolicy({
          variables: {
            input: { id: editPolicy!.id, ...payload },
          },
        });
        if (data?.updateRetentionPolicy?.success) {
          toast.success(`Policy "${values.name}" updated`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.updateRetentionPolicy?.errors?.[0] ??
              "Failed to update policy"
          );
        }
      } else {
        const { data } = await createPolicy({
          variables: { input: payload },
        });
        if (data?.createRetentionPolicy?.success) {
          toast.success(`Policy "${values.name}" created`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.createRetentionPolicy?.errors?.[0] ??
              "Failed to create policy"
          );
        }
      }
    } catch {
      toast.error(isEdit ? "Failed to update policy" : "Failed to create policy");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Retention Policy" : "Create Retention Policy"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update how long this data type is retained and what happens at expiration."
              : "Define how long a data type is retained and what happens when retention expires."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="policy-name">Name *</Label>
            <Input
              id="policy-name"
              placeholder="e.g. Production Audit Logs - 7 Year"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="policy-desc">Description</Label>
            <Textarea
              id="policy-desc"
              placeholder="Describe the scope and intent of this retention policy..."
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="space-y-2">
            <Label>Entity Type *</Label>
            <Controller
              control={control}
              name="entityType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.entityType}>
                    <SelectValue placeholder="Select data type" />
                  </SelectTrigger>
                  <SelectContent>
                    {ENTITY_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.entityType && (
              <p className="text-destructive text-sm">
                {errors.entityType.message}
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="retention-days">Retention (days) *</Label>
              <Input
                id="retention-days"
                type="number"
                min={1}
                step={1}
                {...register("retentionDays")}
                aria-invalid={!!errors.retentionDays}
              />
              {errors.retentionDays && (
                <p className="text-destructive text-sm">
                  {errors.retentionDays.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="min-retention-days">Minimum (days)</Label>
              <Input
                id="min-retention-days"
                type="number"
                min={0}
                step={1}
                placeholder="Optional"
                {...register("minimumRetentionDays")}
                aria-invalid={!!errors.minimumRetentionDays}
              />
              {errors.minimumRetentionDays && (
                <p className="text-destructive text-sm">
                  {errors.minimumRetentionDays.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Expiration Action *</Label>
              <Controller
                control={control}
                name="expirationAction"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.expirationAction}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {EXPIRATION_ACTIONS.map((a) => (
                        <SelectItem key={a.value} value={a.value}>
                          {a.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.expirationAction && (
                <p className="text-destructive text-sm">
                  {errors.expirationAction.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Compliance</Label>
              <Controller
                control={control}
                name="complianceRequirement"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPLIANCE_OPTIONS.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                min={0}
                step={1}
                {...register("priority")}
                aria-invalid={!!errors.priority}
              />
              <p className="text-muted-foreground text-xs">
                Higher priority overrides lower for same entity type.
              </p>
              {errors.priority && (
                <p className="text-destructive text-sm">
                  {errors.priority.message}
                </p>
              )}
            </div>

            <div className="flex flex-col justify-start space-y-2">
              <Label htmlFor="policy-enabled">Status</Label>
              <div className="flex items-center gap-3 pt-1.5">
                <Controller
                  control={control}
                  name="enabled"
                  render={({ field }) => (
                    <Switch
                      id="policy-enabled"
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  )}
                />
                <Label htmlFor="policy-enabled" className="font-normal">
                  Enabled
                </Label>
              </div>
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
              {isEdit ? "Save Changes" : "Create Policy"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
