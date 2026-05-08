"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";

import { usePolicyOptions } from "@/graphql/policies/hooks";
import { CREATE_POLICY } from "@/graphql/policies/mutations";
import type { CreatePolicyPayload } from "@/graphql/policies/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const policySchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(255),
  description: z.string().optional(),
  policyType: z.string().min(1, "Policy type is required"),
  scopeType: z.string().optional(),
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

type PolicyFormValues = z.infer<typeof policySchema>;

export default function CreatePolicyPage() {
  const router = useRouter();
  const { options, loading: optionsLoading } = usePolicyOptions();
  const [createPolicy, { loading: submitting }] = useMutation<{
    createPolicy: CreatePolicyPayload;
  }>(CREATE_POLICY);

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<PolicyFormValues>({
    resolver: zodResolver(policySchema),
    defaultValues: {
      name: "",
      description: "",
      policyType: "",
      scopeType: "organization",
      enforcement: "enforce",
      config: "",
      enabled: true,
      priority: 0,
    },
  });

  const onSubmit = async (values: PolicyFormValues) => {
    try {
      let configObj = null;
      if (values.config && values.config.trim()) {
        configObj = JSON.parse(values.config);
      }

      const { data } = await createPolicy({
        variables: {
          input: {
            name: values.name,
            description: values.description || null,
            policyType: values.policyType,
            scopeType: values.scopeType || null,
            enforcement: values.enforcement || null,
            config: configObj,
            enabled: values.enabled,
            priority: values.priority,
          },
        },
      });

      if (data?.createPolicy?.success) {
        toast.success(`Policy "${values.name}" created`);
        router.push("/policies");
      } else {
        toast.error(data?.createPolicy?.error ?? "Failed to create policy");
      }
    } catch (err) {
      toast.error("Failed to create policy");
    }
  };

  if (optionsLoading) {
    return (
      <div className="flex flex-1 flex-col gap-6 p-6">
        <Skeleton className="h-7 w-48" />
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/policies">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create Policy</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Define a new governance policy for your AI agents
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input id="name" placeholder="e.g. Rate Limit - Production" {...register("name")} aria-invalid={!!errors.name} />
          {errors.name && (
            <p className="text-destructive text-sm">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="Describe what this policy does..."
            {...register("description")}
            rows={3}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Policy Type *</Label>
            <Controller
              control={control}
              name="policyType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger aria-invalid={!!errors.policyType}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.policyTypes.map((pt) => (
                      <SelectItem key={pt.value!} value={pt.value!}>
                        {pt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
            {errors.policyType && (
              <p className="text-destructive text-sm">{errors.policyType.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Scope</Label>
            <Controller
              control={control}
              name="scopeType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {options?.scopeTypes.map((st) => (
                      <SelectItem key={st.value!} value={st.value!}>
                        {st.label}
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
            <Label htmlFor="priority">Priority</Label>
            <Input
              id="priority"
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
          <Label htmlFor="config">Config (JSON)</Label>
          <Textarea
            id="config"
            placeholder='{"requests_per_minute": 60}'
            className="font-mono text-sm"
            rows={6}
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
                id="enabled"
                checked={field.value}
                onCheckedChange={field.onChange}
              />
            )}
          />
          <Label htmlFor="enabled">Enabled</Label>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
            Create Policy
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/policies">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
