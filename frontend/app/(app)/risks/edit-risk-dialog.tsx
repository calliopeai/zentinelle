"use client";

import { useEffect } from "react";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Loader2Icon } from "lucide-react";

import { UPDATE_RISK } from "@/graphql/risks/mutations";
import type { RiskData, UpdateRiskPayload } from "@/graphql/risks/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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

const RISK_CATEGORIES = [
  { value: "security", label: "Security" },
  { value: "privacy", label: "Privacy" },
  { value: "compliance", label: "Compliance" },
  { value: "operational", label: "Operational" },
  { value: "reputational", label: "Reputational" },
  { value: "financial", label: "Financial" },
  { value: "ethical", label: "Ethical" },
];

const RISK_STATUSES = [
  { value: "identified", label: "Identified" },
  { value: "assessed", label: "Assessed" },
  { value: "mitigating", label: "Mitigating" },
  { value: "accepted", label: "Accepted" },
  { value: "transferred", label: "Transferred" },
  { value: "closed", label: "Closed" },
];

const LIKELIHOOD_OPTIONS = [
  { value: 1, label: "1 - Rare" },
  { value: 2, label: "2 - Unlikely" },
  { value: 3, label: "3 - Possible" },
  { value: 4, label: "4 - Likely" },
  { value: 5, label: "5 - Almost Certain" },
];

const IMPACT_OPTIONS = [
  { value: 1, label: "1 - Negligible" },
  { value: 2, label: "2 - Minor" },
  { value: 3, label: "3 - Moderate" },
  { value: 4, label: "4 - Major" },
  { value: 5, label: "5 - Severe" },
];

function riskLevelFromScore(score: number): { label: string; variant: "destructive" | "secondary" | "outline" } {
  if (score >= 20) return { label: "Critical", variant: "destructive" };
  if (score >= 12) return { label: "High", variant: "destructive" };
  if (score >= 6) return { label: "Medium", variant: "secondary" };
  return { label: "Low", variant: "outline" };
}

const editRiskSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(255),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Category is required"),
  status: z.string(),
  likelihood: z.number().int().min(1).max(5),
  impact: z.number().int().min(1).max(5),
  mitigationPlan: z.string().optional(),
  tags: z.array(z.string()),
});

type EditRiskValues = z.infer<typeof editRiskSchema>;

type EditRiskDialogProps = {
  risk: RiskData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
};

export function EditRiskDialog({
  risk,
  open,
  onOpenChange,
  onSaved,
}: EditRiskDialogProps) {
  const [updateRisk, { loading: submitting }] = useMutation<{
    updateRisk: UpdateRiskPayload;
  }>(UPDATE_RISK);

  const {
    register,
    handleSubmit,
    control,
    reset,
    watch,
    formState: { errors },
  } = useForm<EditRiskValues>({
    resolver: zodResolver(editRiskSchema),
    defaultValues: {
      name: "",
      description: "",
      category: "security",
      status: "identified",
      likelihood: 3,
      impact: 3,
      mitigationPlan: "",
      tags: [],
    },
  });

  useEffect(() => {
    if (risk && open) {
      reset({
        name: risk.name,
        description: risk.description,
        category: risk.category,
        status: risk.status,
        likelihood: risk.likelihood,
        impact: risk.impact,
        mitigationPlan: risk.mitigationPlan || "",
        tags: risk.tags || [],
      });
    }
  }, [risk, open, reset]);

  const likelihood = watch("likelihood");
  const impact = watch("impact");
  const riskScore = (likelihood ?? 3) * (impact ?? 3);
  const riskLevel = riskLevelFromScore(riskScore);

  const onSubmit = async (values: EditRiskValues) => {
    if (!risk) return;

    try {
      const { data } = await updateRisk({
        variables: {
          id: risk.id,
          input: {
            name: values.name,
            description: values.description,
            category: values.category,
            status: values.status,
            likelihood: values.likelihood,
            impact: values.impact,
            mitigationPlan: values.mitigationPlan || null,
            tags: values.tags.length > 0 ? values.tags : null,
          },
        },
      });

      if (data?.updateRisk?.success) {
        toast.success(`Risk "${values.name}" updated`);
        onOpenChange(false);
        onSaved();
      } else {
        const err = data?.updateRisk?.errors?.[0] ?? "Failed to update risk";
        toast.error(err);
      }
    } catch {
      toast.error("Failed to update risk");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Risk</DialogTitle>
          <DialogDescription>
            Update the risk assessment and mitigation plan.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="edit-risk-name">Name *</Label>
            <Input id="edit-risk-name" {...register("name")} aria-invalid={!!errors.name} />
            {errors.name && (
              <p className="text-destructive text-sm">{errors.name.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-risk-desc">Description *</Label>
            <Textarea id="edit-risk-desc" rows={3} {...register("description")} aria-invalid={!!errors.description} />
            {errors.description && (
              <p className="text-destructive text-sm">{errors.description.message}</p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Category</Label>
              <Controller
                control={control}
                name="category"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Status</Label>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RISK_STATUSES.map((s) => (
                        <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Likelihood</Label>
              <Controller
                control={control}
                name="likelihood"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LIKELIHOOD_OPTIONS.map((l) => (
                        <SelectItem key={l.value} value={String(l.value)}>{l.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Impact</Label>
              <Controller
                control={control}
                name="impact"
                render={({ field }) => (
                  <Select value={String(field.value)} onValueChange={(v) => field.onChange(parseInt(v))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {IMPACT_OPTIONS.map((i) => (
                        <SelectItem key={i.value} value={String(i.value)}>{i.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </div>

            <div className="space-y-2">
              <Label>Risk Score</Label>
              <div className="flex h-8 items-center gap-2">
                <span className="font-mono text-lg font-bold">{riskScore}</span>
                <Badge variant={riskLevel.variant}>{riskLevel.label}</Badge>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-risk-mitigation">Mitigation Plan</Label>
            <Textarea id="edit-risk-mitigation" rows={3} {...register("mitigationPlan")} />
          </div>

          <div className="space-y-2">
            <Label>Tags</Label>
            <Controller
              control={control}
              name="tags"
              render={({ field }) => (
                <TagInput value={field.value} onChange={field.onChange} placeholder="Add tags..." />
              )}
            />
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
