"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";

import { CREATE_RISK } from "@/graphql/risks/mutations";
import type { CreateRiskPayload } from "@/graphql/risks/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { TagInput } from "@/components/ui/tag-input";
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

const riskSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(255),
  description: z.string().min(10, "Description must be at least 10 characters"),
  category: z.string().min(1, "Category is required"),
  status: z.string(),
  likelihood: z.coerce.number().int().min(1).max(5),
  impact: z.coerce.number().int().min(1).max(5),
  mitigationPlan: z.string().optional(),
  tags: z.array(z.string()),
});

type RiskFormValues = z.infer<typeof riskSchema>;

export default function CreateRiskPage() {
  const router = useRouter();
  const [createRisk, { loading: submitting }] = useMutation<{
    createRisk: CreateRiskPayload;
  }>(CREATE_RISK);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<RiskFormValues>({
    resolver: zodResolver(riskSchema),
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

  const likelihood = watch("likelihood");
  const impact = watch("impact");
  const riskScore = (likelihood ?? 3) * (impact ?? 3);
  const riskLevel = riskLevelFromScore(riskScore);

  const onSubmit = async (values: RiskFormValues) => {
    try {
      const { data } = await createRisk({
        variables: {
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

      if (data?.createRisk?.success) {
        toast.success(`Risk "${values.name}" created`);
        router.push("/risks");
      } else {
        const err = data?.createRisk?.errors?.[0] ?? "Failed to create risk";
        toast.error(err);
      }
    } catch {
      toast.error("Failed to create risk");
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/risks">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Risk</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Identify and assess a new risk for your AI operations
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="e.g. Unauthorized data access via agent"
            {...register("name")}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-destructive text-sm">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description *</Label>
          <Textarea
            id="description"
            placeholder="Describe the risk, its context, and potential consequences..."
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
            <Label>Category *</Label>
            <Controller
              control={control}
              name="category"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.category}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.category && (
              <p className="text-destructive text-sm">{errors.category.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Status</Label>
            <Controller
              control={control}
              name="status"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Likelihood *</Label>
            <Controller
              control={control}
              name="likelihood"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {LIKELIHOOD_OPTIONS.map((l) => (
                      <SelectItem key={l.value} value={String(l.value)}>
                        {l.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Impact *</Label>
            <Controller
              control={control}
              name="impact"
              render={({ field }) => (
                <Select
                  value={String(field.value)}
                  onValueChange={(v) => field.onChange(parseInt(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                  <SelectContent>
                    {IMPACT_OPTIONS.map((i) => (
                      <SelectItem key={i.value} value={String(i.value)}>
                        {i.label}
                      </SelectItem>
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
          <Label htmlFor="mitigationPlan">Mitigation Plan</Label>
          <Textarea
            id="mitigationPlan"
            placeholder="Describe the planned mitigation steps..."
            rows={4}
            {...register("mitigationPlan")}
          />
        </div>

        <div className="space-y-2">
          <Label>Tags</Label>
          <Controller
            control={control}
            name="tags"
            render={({ field }) => (
              <TagInput
                value={field.value}
                onChange={field.onChange}
                placeholder="Add tags..."
              />
            )}
          />
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            Create Risk
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/risks">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
