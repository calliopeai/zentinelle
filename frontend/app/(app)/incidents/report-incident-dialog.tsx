"use client";

import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { CREATE_INCIDENT } from "@/graphql/risks/mutations";
import type { CreateIncidentPayload } from "@/graphql/risks/types";

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

const INCIDENT_TYPES = [
  { value: "policy_violation", label: "Policy Violation" },
  { value: "security_breach", label: "Security Breach" },
  { value: "data_leak", label: "Data Leak" },
  { value: "service_disruption", label: "Service Disruption" },
  { value: "compliance_breach", label: "Compliance Breach" },
  { value: "cost_overrun", label: "Cost Overrun" },
  { value: "harmful_output", label: "Harmful Output" },
  { value: "other", label: "Other" },
];

const SEVERITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "investigating", label: "Investigating" },
  { value: "mitigating", label: "Mitigating" },
  { value: "resolved", label: "Resolved" },
  { value: "closed", label: "Closed" },
];

const incidentSchema = z.object({
  title: z.string().min(5, "Title must be at least 5 characters").max(255),
  description: z.string().min(10, "Description must be at least 10 characters"),
  incidentType: z.string().min(1, "Incident type is required"),
  severity: z.string().min(1, "Severity is required"),
  affectedUser: z.string().optional(),
  rootCause: z.string().optional(),
});

type IncidentFormValues = z.infer<typeof incidentSchema>;

type ReportIncidentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReported: () => void;
};

export function ReportIncidentDialog({
  open,
  onOpenChange,
  onReported,
}: ReportIncidentDialogProps) {
  const [createIncident, { loading: submitting }] = useMutation<{
    createIncident: CreateIncidentPayload;
  }>(CREATE_INCIDENT);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<IncidentFormValues>({
    resolver: zodResolver(incidentSchema),
    defaultValues: {
      title: "",
      description: "",
      incidentType: "policy_violation",
      severity: "medium",
      affectedUser: "",
      rootCause: "",
    },
  });

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      reset();
    }
    onOpenChange(isOpen);
  };

  const onSubmit = async (values: IncidentFormValues) => {
    try {
      const { data } = await createIncident({
        variables: {
          input: {
            title: values.title,
            description: values.description,
            incidentType: values.incidentType,
            severity: values.severity,
            affectedUser: values.affectedUser || null,
          },
        },
      });

      if (data?.createIncident?.success) {
        toast.success(`Incident "${values.title}" reported`);
        handleClose(false);
        onReported();
      } else {
        const err = data?.createIncident?.errors?.[0] ?? "Failed to report incident";
        toast.error(err);
      }
    } catch {
      toast.error("Failed to report incident");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report Incident</DialogTitle>
          <DialogDescription>
            Report a new security incident or policy violation for tracking and resolution.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="incident-title">Title *</Label>
            <Input
              id="incident-title"
              placeholder="e.g. Agent accessed restricted data"
              {...register("title")}
              aria-invalid={!!errors.title}
            />
            {errors.title && (
              <p className="text-destructive text-sm">{errors.title.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="incident-desc">Description *</Label>
            <Textarea
              id="incident-desc"
              placeholder="Describe what happened, when, and the potential impact..."
              rows={4}
              {...register("description")}
              aria-invalid={!!errors.description}
            />
            {errors.description && (
              <p className="text-destructive text-sm">{errors.description.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Incident Type *</Label>
              <Controller
                control={control}
                name="incidentType"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.incidentType}>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {INCIDENT_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.incidentType && (
                <p className="text-destructive text-sm">{errors.incidentType.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Severity *</Label>
              <Controller
                control={control}
                name="severity"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-invalid={!!errors.severity}>
                      <SelectValue placeholder="Select severity" />
                    </SelectTrigger>
                    <SelectContent>
                      {SEVERITY_OPTIONS.map((s) => (
                        <SelectItem key={s.value} value={s.value}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {errors.severity && (
                <p className="text-destructive text-sm">{errors.severity.message}</p>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="incident-user">Affected User</Label>
            <Input
              id="incident-user"
              placeholder="e.g. user@example.com"
              {...register("affectedUser")}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="incident-root-cause">Root Cause</Label>
            <Textarea
              id="incident-root-cause"
              placeholder="If known, describe the root cause..."
              rows={3}
              {...register("rootCause")}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleClose(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
              Report Incident
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
