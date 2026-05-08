"use client";

import { useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import { useForm, Controller } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowLeftIcon, Loader2Icon } from "lucide-react";
import Link from "next/link";

import { CREATE_SYSTEM_PROMPT } from "@/graphql/prompts/mutations";
import type { CreateSystemPromptPayload } from "@/graphql/prompts/types";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { TagInput } from "@/components/ui/tag-input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PROMPT_TYPES = [
  { value: "system", label: "System Prompt" },
  { value: "persona", label: "Persona/Role" },
  { value: "task", label: "Task Template" },
  { value: "chain", label: "Prompt Chain" },
  { value: "few_shot", label: "Few-Shot Examples" },
];

const VISIBILITY_OPTIONS = [
  { value: "private", label: "Private" },
  { value: "organization", label: "Organization" },
  { value: "public", label: "Public Library" },
];

const PROVIDER_OPTIONS = [
  "anthropic",
  "openai",
  "google",
  "aws_bedrock",
  "azure",
  "together",
  "fireworks",
  "huggingface",
  "openrouter",
];

const promptSchema = z.object({
  name: z.string().min(3, "Name must be at least 3 characters").max(255),
  description: z.string().optional(),
  promptText: z.string().min(10, "Prompt text must be at least 10 characters"),
  promptType: z.string(),
  visibility: z.string(),
  compatibleProviders: z.array(z.string()),
  recommendedTemperature: z
    .number()
    .min(0, "Temperature must be 0-1")
    .max(1, "Temperature must be 0-1")
    .optional(),
});

type PromptFormValues = z.infer<typeof promptSchema>;

export default function CreateSystemPromptPage() {
  const router = useRouter();
  const [createPrompt, { loading: submitting }] = useMutation<{
    createSystemPrompt: CreateSystemPromptPayload;
  }>(CREATE_SYSTEM_PROMPT);

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<PromptFormValues>({
    resolver: zodResolver(promptSchema),
    defaultValues: {
      name: "",
      description: "",
      promptText: "",
      promptType: "system",
      visibility: "organization",
      compatibleProviders: [],
      recommendedTemperature: undefined,
    },
  });

  const promptText = watch("promptText");
  const lineCount = (promptText || "").split("\n").length;

  const onSubmit = async (values: PromptFormValues) => {
    try {
      const temp = values.recommendedTemperature;

      const { data } = await createPrompt({
        variables: {
          input: {
            name: values.name,
            description: values.description || null,
            promptText: values.promptText,
            promptType: values.promptType,
            visibility: values.visibility,
            compatibleProviders:
              values.compatibleProviders.length > 0
                ? values.compatibleProviders
                : null,
            recommendedTemperature: temp ?? null,
          },
        },
      });

      if (data?.createSystemPrompt?.prompt) {
        toast.success(`Prompt "${values.name}" created`);
        router.push("/system-prompts");
      } else {
        const err =
          data?.createSystemPrompt?.errors?.[0] ?? "Failed to create prompt";
        toast.error(err);
      }
    } catch {
      toast.error("Failed to create prompt");
    }
  };

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/system-prompts">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-xl font-semibold">Create System Prompt</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Add a new system prompt template to the library
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
        <div className="space-y-2">
          <Label htmlFor="name">Name *</Label>
          <Input
            id="name"
            placeholder="e.g. Code Review Assistant"
            {...register("name")}
            aria-invalid={!!errors.name}
          />
          {errors.name && (
            <p className="text-destructive text-sm">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description</Label>
          <Textarea
            id="description"
            placeholder="A brief description of what this prompt does..."
            rows={2}
            {...register("description")}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="promptText">Prompt Text *</Label>
            <span className="text-muted-foreground text-xs">
              {lineCount} line{lineCount !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="relative">
            <div className="pointer-events-none absolute top-0 left-0 flex flex-col border-r px-2 py-2 text-right">
              {Array.from({ length: lineCount }).map((_, i) => (
                <span
                  key={i}
                  className="text-muted-foreground/50 font-mono text-sm leading-[1.7]"
                >
                  {i + 1}
                </span>
              ))}
            </div>
            <Textarea
              id="promptText"
              placeholder="You are a helpful assistant that..."
              className="min-h-[200px] pl-12 font-mono text-sm"
              style={{ lineHeight: "1.7" }}
              rows={12}
              {...register("promptText")}
              aria-invalid={!!errors.promptText}
            />
          </div>
          {errors.promptText && (
            <p className="text-destructive text-sm">
              {errors.promptText.message}
            </p>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label>Prompt Type</Label>
            <Controller
              control={control}
              name="promptType"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROMPT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label>Visibility</Label>
            <Controller
              control={control}
              name="visibility"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select visibility" />
                  </SelectTrigger>
                  <SelectContent>
                    {VISIBILITY_OPTIONS.map((v) => (
                      <SelectItem key={v.value} value={v.value}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="temp">Temperature (0-1)</Label>
            <Input
              id="temp"
              type="number"
              step="0.05"
              min={0}
              max={1}
              placeholder="0.7"
              {...register("recommendedTemperature", { valueAsNumber: true })}
              aria-invalid={!!errors.recommendedTemperature}
            />
            {errors.recommendedTemperature && (
              <p className="text-destructive text-sm">
                {errors.recommendedTemperature.message}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label>Compatible Providers</Label>
          <Controller
            control={control}
            name="compatibleProviders"
            render={({ field }) => (
              <TagInput
                value={field.value}
                onChange={field.onChange}
                suggestions={PROVIDER_OPTIONS}
                placeholder="Add providers..."
              />
            )}
          />
          <p className="text-muted-foreground text-xs">
            Select which LLM providers this prompt is designed for.
          </p>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" disabled={submitting}>
            {submitting && (
              <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create Prompt
          </Button>
          <Button type="button" variant="outline" asChild>
            <Link href="/system-prompts">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
