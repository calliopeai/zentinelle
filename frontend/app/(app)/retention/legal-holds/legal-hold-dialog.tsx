"use client";

import { useEffect, useMemo } from "react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import {
  useCreateLegalHold,
  useUpdateLegalHold,
} from "@/graphql/legal-holds/hooks";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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

export type LegalHoldEditData = {
  id: string;
  name: string;
  description: string | null;
  referenceNumber: string | null;
  holdType: string;
  appliesToAll: boolean;
  entityTypes: string[];
  userIdentifiers: string[];
  dataFrom: string | null;
  dataTo: string | null;
  effectiveDate: string | null;
  expirationDate: string | null;
  custodianEmail: string | null;
  notifyOnAccess: boolean;
  notificationEmails: string[];
};

const HOLD_TYPES = [
  { value: "preservation", label: "General Preservation" },
  { value: "litigation", label: "Litigation Hold" },
  { value: "regulatory", label: "Regulatory Investigation" },
  { value: "internal", label: "Internal Investigation" },
];

const ENTITY_TYPE_SUGGESTIONS = [
  "events",
  "interactions",
  "scans",
  "audit_logs",
  "sessions",
  "secrets",
  "usage_data",
];

const optionalEmail = z
  .string()
  .trim()
  .email("Invalid email address")
  .optional()
  .or(z.literal(""));

const legalHoldSchema = z
  .object({
    name: z.string().min(2, "Name must be at least 2 characters").max(255),
    description: z.string().optional(),
    referenceNumber: z.string().max(100).optional(),
    holdType: z.string().min(1, "Hold type is required"),
    appliesToAll: z.boolean(),
    entityTypes: z.array(z.string()),
    userIdentifiers: z.array(z.string()),
    dataFrom: z.string().optional(),
    dataTo: z.string().optional(),
    effectiveDate: z.string().optional(),
    expirationDate: z.string().optional(),
    custodianEmail: optionalEmail,
    notifyOnAccess: z.boolean(),
    notificationEmails: z.array(z.string().email("Invalid email")),
  })
  .refine(
    (val) => val.appliesToAll || val.entityTypes.length > 0,
    {
      message: "Select at least one entity type, or enable Applies to all",
      path: ["entityTypes"],
    },
  )
  .refine(
    (val) => {
      if (!val.dataFrom || !val.dataTo) return true;
      return new Date(val.dataFrom) <= new Date(val.dataTo);
    },
    { message: "Data start must be before data end", path: ["dataTo"] },
  )
  .refine(
    (val) => {
      if (!val.effectiveDate || !val.expirationDate) return true;
      return new Date(val.effectiveDate) <= new Date(val.expirationDate);
    },
    {
      message: "Effective date must be before expiration date",
      path: ["expirationDate"],
    },
  );

type LegalHoldFormValues = z.infer<typeof legalHoldSchema>;

type LegalHoldDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  editHold?: LegalHoldEditData | null;
};

const DEFAULT_VALUES: LegalHoldFormValues = {
  name: "",
  description: "",
  referenceNumber: "",
  holdType: "preservation",
  appliesToAll: false,
  entityTypes: [],
  userIdentifiers: [],
  dataFrom: "",
  dataTo: "",
  effectiveDate: "",
  expirationDate: "",
  custodianEmail: "",
  notifyOnAccess: false,
  notificationEmails: [],
};

// datetime-local <input> wants "YYYY-MM-DDTHH:mm" without timezone info.
function toDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    d.getFullYear() +
    "-" +
    pad(d.getMonth() + 1) +
    "-" +
    pad(d.getDate()) +
    "T" +
    pad(d.getHours()) +
    ":" +
    pad(d.getMinutes())
  );
}

function toIsoOrNull(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function LegalHoldDialog({
  open,
  onOpenChange,
  onSaved,
  editHold,
}: LegalHoldDialogProps) {
  const isEdit = !!editHold;

  const [createHold, { loading: creating }] = useCreateLegalHold();
  const [updateHold, { loading: updating }] = useUpdateLegalHold();
  const submitting = creating || updating;

  const initialValues = useMemo<LegalHoldFormValues>(() => {
    if (!editHold) return DEFAULT_VALUES;
    return {
      name: editHold.name,
      description: editHold.description ?? "",
      referenceNumber: editHold.referenceNumber ?? "",
      holdType: editHold.holdType,
      appliesToAll: editHold.appliesToAll,
      entityTypes: editHold.entityTypes ?? [],
      userIdentifiers: editHold.userIdentifiers ?? [],
      dataFrom: toDatetimeLocalValue(editHold.dataFrom),
      dataTo: toDatetimeLocalValue(editHold.dataTo),
      effectiveDate: toDatetimeLocalValue(editHold.effectiveDate),
      expirationDate: toDatetimeLocalValue(editHold.expirationDate),
      custodianEmail: editHold.custodianEmail ?? "",
      notifyOnAccess: editHold.notifyOnAccess,
      notificationEmails: editHold.notificationEmails ?? [],
    };
  }, [editHold]);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<LegalHoldFormValues>({
    resolver: zodResolver(legalHoldSchema),
    defaultValues: DEFAULT_VALUES,
  });

  useEffect(() => {
    if (!open) return;
    reset(initialValues);
  }, [open, initialValues, reset]);

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) reset(DEFAULT_VALUES);
    onOpenChange(isOpen);
  };

  const appliesToAll = watch("appliesToAll");

  const onSubmit = async (values: LegalHoldFormValues) => {
    const payload = {
      name: values.name.trim(),
      description: values.description?.trim() || null,
      referenceNumber: values.referenceNumber?.trim() || null,
      holdType: values.holdType,
      appliesToAll: values.appliesToAll,
      entityTypes: values.appliesToAll ? [] : values.entityTypes,
      userIdentifiers: values.userIdentifiers,
      dataFrom: toIsoOrNull(values.dataFrom ?? ""),
      dataTo: toIsoOrNull(values.dataTo ?? ""),
      effectiveDate: toIsoOrNull(values.effectiveDate ?? ""),
      expirationDate: toIsoOrNull(values.expirationDate ?? ""),
      custodianEmail: values.custodianEmail?.trim() || null,
      notifyOnAccess: values.notifyOnAccess,
      notificationEmails: values.notificationEmails,
    };

    try {
      if (isEdit) {
        const { data } = await updateHold({
          variables: { input: { id: editHold!.id, ...payload } },
        });
        if (data?.updateLegalHold?.success) {
          toast.success(`Legal hold "${values.name}" updated`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.updateLegalHold?.errors?.[0] ?? "Failed to update legal hold",
          );
        }
      } else {
        const { data } = await createHold({
          variables: { input: payload },
        });
        if (data?.createLegalHold?.success) {
          toast.success(`Legal hold "${values.name}" created`);
          handleClose(false);
          onSaved();
        } else {
          toast.error(
            data?.createLegalHold?.errors?.[0] ?? "Failed to create legal hold",
          );
        }
      }
    } catch {
      toast.error(
        isEdit ? "Failed to update legal hold" : "Failed to create legal hold",
      );
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit Legal Hold" : "Create Legal Hold"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Update the scope and metadata for this legal hold."
              : "Freeze data from retention deletion for litigation, audit, or investigation."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hold-name">Name *</Label>
            <Input
              id="hold-name"
              placeholder="e.g. Smith v. Acme — Q3 2026 records"
              {...register("name")}
              aria-invalid={!!errors.name}
            />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="hold-desc">Description</Label>
            <Textarea
              id="hold-desc"
              placeholder="Reason for the hold, scope notes, custodian instructions..."
              rows={2}
              {...register("description")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="hold-ref">Reference Number</Label>
              <Input
                id="hold-ref"
                placeholder="Case / matter ID"
                {...register("referenceNumber")}
              />
            </div>

            <div className="space-y-2">
              <Label>Hold Type *</Label>
              <Controller
                control={control}
                name="holdType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.holdType}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {HOLD_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.holdType && (
                <p className="text-destructive text-sm">
                  {errors.holdType.message}
                </p>
              )}
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="applies-to-all" className="font-medium">
                  Applies to all data
                </Label>
                <p className="text-muted-foreground text-xs">
                  Hold every entity type and user. Overrides entity type
                  selection below.
                </p>
              </div>
              <Controller
                control={control}
                name="appliesToAll"
                render={({ field }) => (
                  <Switch
                    id="applies-to-all"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Entity Types</Label>
            <Controller
              control={control}
              name="entityTypes"
              render={({ field }) => (
                <TagInput
                  value={field.value}
                  onChange={field.onChange}
                  suggestions={ENTITY_TYPE_SUGGESTIONS}
                  placeholder={
                    appliesToAll
                      ? "Disabled — applies to all data"
                      : "Add entity types (events, interactions, ...)"
                  }
                />
              )}
            />
            {errors.entityTypes && (
              <p className="text-destructive text-sm">
                {errors.entityTypes.message as string}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>User Identifiers</Label>
            <Controller
              control={control}
              name="userIdentifiers"
              render={({ field }) => (
                <TagInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder="Specific user IDs / emails to hold (optional)"
                />
              )}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="data-from">Data From</Label>
              <Input
                id="data-from"
                type="datetime-local"
                {...register("dataFrom")}
              />
              <p className="text-muted-foreground text-xs">
                Hold data created on or after this time.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="data-to">Data To</Label>
              <Input
                id="data-to"
                type="datetime-local"
                {...register("dataTo")}
                aria-invalid={!!errors.dataTo}
              />
              {errors.dataTo && (
                <p className="text-destructive text-sm">
                  {errors.dataTo.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="effective-date">Effective Date</Label>
              <Input
                id="effective-date"
                type="datetime-local"
                {...register("effectiveDate")}
              />
              <p className="text-muted-foreground text-xs">
                Defaults to now if left blank.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiration-date">Expiration Date</Label>
              <Input
                id="expiration-date"
                type="datetime-local"
                {...register("expirationDate")}
                aria-invalid={!!errors.expirationDate}
              />
              {errors.expirationDate && (
                <p className="text-destructive text-sm">
                  {errors.expirationDate.message}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Leave blank for an indefinite hold.
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custodian-email">Custodian Email</Label>
            <Input
              id="custodian-email"
              type="email"
              placeholder="counsel@example.com"
              {...register("custodianEmail")}
              aria-invalid={!!errors.custodianEmail}
            />
            {errors.custodianEmail && (
              <p className="text-destructive text-sm">
                {errors.custodianEmail.message}
              </p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notify-on-access" className="font-medium">
                  Notify on access
                </Label>
                <p className="text-muted-foreground text-xs">
                  Send a notification when held data is accessed.
                </p>
              </div>
              <Controller
                control={control}
                name="notifyOnAccess"
                render={({ field }) => (
                  <Switch
                    id="notify-on-access"
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                )}
              />
            </div>
            <div className="space-y-2 pt-2">
              <Label>Notification Emails</Label>
              <Controller
                control={control}
                name="notificationEmails"
                render={({ field }) => (
                  <TagInput
                    value={field.value}
                    onChange={field.onChange}
                    placeholder="Add emails to notify"
                  />
                )}
              />
              {errors.notificationEmails && (
                <p className="text-destructive text-sm">
                  {(errors.notificationEmails as { message?: string })
                    .message ?? "Invalid email in list"}
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
              {isEdit ? "Save Changes" : "Create Hold"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
