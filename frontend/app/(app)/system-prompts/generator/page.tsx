"use client";

import { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "@apollo/client/react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CheckIcon,
  CodeIcon,
  UserIcon,
  ListChecksIcon,
  ShieldAlertIcon,
  BookOpenIcon,
  LayoutTemplateIcon,
  LinkIcon,
  Loader2Icon,
  SaveIcon,
  CopyIcon,
  PencilIcon,
  PlayIcon,
  SparklesIcon,
  PlusIcon,
  XIcon,
  SendIcon,
} from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { CREATE_SYSTEM_PROMPT } from "@/graphql/prompts/mutations";
import type { CreateSystemPromptPayload } from "@/graphql/prompts/types";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";

// ---------------------------------------------------------------------------
// Type definitions for the wizard
// ---------------------------------------------------------------------------

interface PromptTypeOption {
  value: string;
  label: string;
  icon: React.ReactNode;
  color: string;
  description: string;
  configFields: ConfigField[];
}

interface ConfigField {
  key: string;
  label: string;
  placeholder: string;
  type: "text" | "textarea" | "list";
  required?: boolean;
}

// ---------------------------------------------------------------------------
// Prompt type catalogue with per-type config fields
// ---------------------------------------------------------------------------

const PROMPT_TYPES: PromptTypeOption[] = [
  {
    value: "system",
    label: "System Prompt",
    icon: <CodeIcon className="h-6 w-6" />,
    color: "text-blue-500",
    description:
      "Core instructions that define the AI's role, constraints, and output format. The foundation of agent behavior.",
    configFields: [
      { key: "role", label: "Role", placeholder: "e.g. Senior Code Reviewer", type: "text", required: true },
      { key: "constraints", label: "Constraints", placeholder: "e.g. Only review Python and TypeScript code", type: "textarea" },
      { key: "outputFormat", label: "Output Format", placeholder: "e.g. Markdown with code blocks and severity labels", type: "text" },
    ],
  },
  {
    value: "persona",
    label: "Persona / Role",
    icon: <UserIcon className="h-6 w-6" />,
    color: "text-purple-500",
    description:
      "Define a character with personality traits, speaking style, and knowledge areas. The AI adopts this identity.",
    configFields: [
      { key: "characterTraits", label: "Character Traits", placeholder: "e.g. patient, detail-oriented, encouraging", type: "text", required: true },
      { key: "speakingStyle", label: "Speaking Style", placeholder: "e.g. professional but warm, uses analogies", type: "text" },
      { key: "knowledgeAreas", label: "Knowledge Areas", placeholder: "e.g. distributed systems, database optimization", type: "text", required: true },
    ],
  },
  {
    value: "task",
    label: "Task Template",
    icon: <ListChecksIcon className="h-6 w-6" />,
    color: "text-green-500",
    description:
      "Structured instructions for a specific task with an objective, steps to follow, and success criteria.",
    configFields: [
      { key: "objective", label: "Objective", placeholder: "e.g. Review pull requests for security vulnerabilities", type: "text", required: true },
      { key: "steps", label: "Steps", placeholder: "Add the steps the AI should follow", type: "list" },
      { key: "successCriteria", label: "Success Criteria", placeholder: "e.g. All critical vulnerabilities identified, no false positives", type: "textarea" },
    ],
  },
  {
    value: "safety",
    label: "Safety Guardrails",
    icon: <ShieldAlertIcon className="h-6 w-6" />,
    color: "text-red-500",
    description:
      "Define boundaries: what the AI must never do, what topics are allowed or restricted, and fallback behaviors.",
    configFields: [
      { key: "boundaries", label: "Boundaries (Never Do)", placeholder: "Add things the AI must never do", type: "list", required: true },
      { key: "allowedTopics", label: "Allowed Topics", placeholder: "e.g. Technical support, billing questions, product features", type: "textarea" },
      { key: "restrictedTopics", label: "Restricted Topics", placeholder: "e.g. Competitor comparisons, legal advice, medical diagnoses", type: "textarea" },
    ],
  },
  {
    value: "few_shot",
    label: "Few-Shot Examples",
    icon: <BookOpenIcon className="h-6 w-6" />,
    color: "text-orange-500",
    description:
      "Teach the AI by providing input/output example pairs. Ensures consistent response format and quality.",
    configFields: [
      { key: "taskDescription", label: "Task Description", placeholder: "e.g. Classify customer support tickets by urgency", type: "text", required: true },
      { key: "example1Input", label: "Example 1 Input", placeholder: "e.g. My payment failed and I can't access my account", type: "textarea", required: true },
      { key: "example1Output", label: "Example 1 Output", placeholder: "e.g. Category: Billing, Urgency: High", type: "textarea", required: true },
      { key: "example2Input", label: "Example 2 Input", placeholder: "e.g. How do I change my notification preferences?", type: "textarea" },
      { key: "example2Output", label: "Example 2 Output", placeholder: "e.g. Category: Account Settings, Urgency: Low", type: "textarea" },
    ],
  },
  {
    value: "format",
    label: "Output Format",
    icon: <LayoutTemplateIcon className="h-6 w-6" />,
    color: "text-cyan-500",
    description:
      "Control how the AI structures its output: sections, formatting rules, length limits, and data formats.",
    configFields: [
      { key: "sections", label: "Sections", placeholder: "Add the sections for the output", type: "list", required: true },
      { key: "formattingRules", label: "Formatting Rules", placeholder: "e.g. Use markdown headings, include code blocks for examples", type: "textarea" },
      { key: "maxLength", label: "Max Length (words)", placeholder: "e.g. 500", type: "text" },
    ],
  },
  {
    value: "chain",
    label: "Prompt Chain",
    icon: <LinkIcon className="h-6 w-6" />,
    color: "text-pink-500",
    description:
      "Define a single step in a multi-step prompt workflow. Passes context between steps for complex tasks.",
    configFields: [
      { key: "stepNumber", label: "Step Number", placeholder: "e.g. 1", type: "text", required: true },
      { key: "totalSteps", label: "Total Steps", placeholder: "e.g. 3", type: "text", required: true },
      { key: "currentTask", label: "Current Step Task", placeholder: "e.g. Parse and categorize the raw input data", type: "textarea", required: true },
      { key: "outputForNext", label: "Output for Next Step", placeholder: "e.g. Structured JSON with categories and confidence scores", type: "text" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Prompt generation from config values
// ---------------------------------------------------------------------------

function generatePrompt(
  type: string,
  config: Record<string, string | string[]>
): string {
  switch (type) {
    case "system": {
      const lines = [`You are a ${config.role || "helpful AI assistant"}.`];
      if (config.constraints) {
        lines.push("", "Constraints:", ...String(config.constraints).split("\n").map((l) => `- ${l.trim()}`).filter((l) => l !== "- "));
      }
      if (config.outputFormat) {
        lines.push("", `Output format: ${config.outputFormat}`);
      }
      lines.push(
        "",
        "Guidelines:",
        "- Ask clarifying questions when the request is ambiguous",
        "- Acknowledge limitations honestly",
        "- Provide accurate, well-structured responses"
      );
      return lines.join("\n");
    }

    case "persona": {
      const lines = [
        `You are an expert with the following traits: ${config.characterTraits || "professional and knowledgeable"}.`,
      ];
      if (config.knowledgeAreas) {
        lines.push("", `Areas of expertise: ${config.knowledgeAreas}`);
      }
      if (config.speakingStyle) {
        lines.push("", `Communication style: ${config.speakingStyle}`);
      }
      lines.push("", "Stay in character throughout the conversation. Draw on your expertise to provide thoughtful, well-informed responses.");
      return lines.join("\n");
    }

    case "task": {
      const lines = [`Objective: ${config.objective || "Complete the assigned task"}`];
      const steps = Array.isArray(config.steps) ? config.steps : [];
      if (steps.length > 0) {
        lines.push("", "Steps:");
        steps.forEach((step, i) => {
          lines.push(`${i + 1}. ${step}`);
        });
      }
      if (config.successCriteria) {
        lines.push("", "Success criteria:", ...String(config.successCriteria).split("\n").map((l) => `- ${l.trim()}`).filter((l) => l !== "- "));
      }
      return lines.join("\n");
    }

    case "safety": {
      const boundaries = Array.isArray(config.boundaries) ? config.boundaries : [];
      const lines = ["Safety Guidelines:", ""];
      if (boundaries.length > 0) {
        lines.push("NEVER:");
        boundaries.forEach((b) => lines.push(`- ${b}`));
        lines.push("");
      }
      if (config.allowedTopics) {
        lines.push(`Allowed topics: ${config.allowedTopics}`, "");
      }
      if (config.restrictedTopics) {
        lines.push(`Restricted topics: ${config.restrictedTopics}`, "");
      }
      lines.push("When uncertain, decline gracefully and suggest the user contact a human representative.");
      return lines.join("\n");
    }

    case "few_shot": {
      const lines = [
        `Task: ${config.taskDescription || "Apply the pattern from these examples"}`,
        "",
        "Learn from these examples:",
      ];
      if (config.example1Input && config.example1Output) {
        lines.push("", "Example 1:", `Input: ${config.example1Input}`, `Output: ${config.example1Output}`);
      }
      if (config.example2Input && config.example2Output) {
        lines.push("", "Example 2:", `Input: ${config.example2Input}`, `Output: ${config.example2Output}`);
      }
      lines.push("", "Now apply the same pattern to new inputs.");
      return lines.join("\n");
    }

    case "format": {
      const sections = Array.isArray(config.sections) ? config.sections : [];
      const lines = ["Format your response as follows:", ""];
      sections.forEach((s) => {
        lines.push(`## ${s}`, "[content]", "");
      });
      if (config.formattingRules) {
        lines.push(`Formatting: ${config.formattingRules}`);
      }
      if (config.maxLength) {
        lines.push(`Maximum length: ${config.maxLength} words.`);
      }
      return lines.join("\n");
    }

    case "chain": {
      return [
        `This is step ${config.stepNumber || "1"} of ${config.totalSteps || "3"} in the workflow.`,
        "",
        "Previous context:",
        "{{previous_output}}",
        "",
        "Current task:",
        String(config.currentTask || "Complete this step"),
        "",
        "Instructions:",
        "- Complete the current task using the previous context",
        "- Format output for the next step",
        "- Include metadata: step completed, confidence level",
        "",
        config.outputForNext
          ? `Pass to next step: ${config.outputForNext}`
          : "Pass your result to the next step.",
      ].join("\n");
    }

    default:
      return "";
  }
}

// ---------------------------------------------------------------------------
// Step indicator component
// ---------------------------------------------------------------------------

const STEP_LABELS = ["Type", "Configure", "Review", "Test"];

function StepIndicator({ current }: { current: number }) {
  return (
    <div className="space-y-2">
      <div className="flex gap-1">
        {STEP_LABELS.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < current ? "bg-[#37efed]" : i === current ? "bg-[#37efed]/50" : "bg-muted"
            }`}
          />
        ))}
      </div>
      <div className="flex justify-between px-0.5">
        {STEP_LABELS.map((label, i) => (
          <span
            key={label}
            className={`text-xs ${
              i <= current ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List input component (for steps, boundaries, sections)
// ---------------------------------------------------------------------------

function ListInput({
  value,
  onChange,
  placeholder,
}: {
  value: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const trimmed = draft.trim();
    if (trimmed) {
      onChange([...value, trimmed]);
      setDraft("");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={placeholder}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          disabled={!draft.trim()}
          className="h-8 shrink-0"
        >
          <PlusIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      {value.length > 0 && (
        <div className="space-y-1.5">
          {value.map((item, i) => (
            <div
              key={i}
              className="bg-muted flex items-center gap-2 rounded-md px-3 py-1.5 text-sm"
            >
              <span className="text-muted-foreground font-mono text-xs">
                {i + 1}.
              </span>
              <span className="flex-1">{item}</span>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <XIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PromptGeneratorPage() {
  const router = useRouter();
  const [copied, copy] = useCopyToClipboard();

  // Wizard state
  const [step, setStep] = useState(0);
  const [selectedType, setSelectedType] = useState<string>("");
  const [config, setConfig] = useState<Record<string, string | string[]>>({});
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [testInput, setTestInput] = useState("");
  const [testResult, setTestResult] = useState("");
  const [testLoading, setTestLoading] = useState(false);

  // Save mutation
  const [createPrompt, { loading: saving }] = useMutation<{
    createSystemPrompt: CreateSystemPromptPayload;
  }>(CREATE_SYSTEM_PROMPT);

  const typeOption = PROMPT_TYPES.find((t) => t.value === selectedType);
  const tokenCount = useMemo(
    () => Math.ceil(generatedPrompt.length / 4),
    [generatedPrompt]
  );

  // Navigation
  const canAdvance = useMemo(() => {
    switch (step) {
      case 0:
        return !!selectedType;
      case 1: {
        if (!typeOption) return false;
        return typeOption.configFields
          .filter((f) => f.required)
          .every((f) => {
            const v = config[f.key];
            if (Array.isArray(v)) return v.length > 0;
            return !!v && String(v).trim().length > 0;
          });
      }
      case 2:
        return generatedPrompt.trim().length > 10;
      case 3:
        return true;
      default:
        return false;
    }
  }, [step, selectedType, typeOption, config, generatedPrompt]);

  const handleNext = useCallback(() => {
    if (step === 1) {
      // Generate the prompt when moving from Configure to Review
      const prompt = generatePrompt(selectedType, config);
      setGeneratedPrompt(prompt);
    }
    setStep((s) => Math.min(s + 1, 3));
  }, [step, selectedType, config]);

  const handleBack = useCallback(() => {
    setIsEditing(false);
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const handleConfigChange = useCallback(
    (key: string, value: string | string[]) => {
      setConfig((prev) => ({ ...prev, [key]: value }));
    },
    []
  );

  const handleRegenerate = useCallback(() => {
    const prompt = generatePrompt(selectedType, config);
    setGeneratedPrompt(prompt);
    setIsEditing(false);
  }, [selectedType, config]);

  const handleTest = useCallback(async () => {
    if (!testInput.trim()) return;
    setTestLoading(true);
    // Simulate a test response — in production this would hit the test_system_prompt mutation
    await new Promise((resolve) => setTimeout(resolve, 1200));
    setTestResult(
      `[Preview] Given the system prompt and your input "${testInput.slice(0, 50)}...", the AI would respond following the configured guidelines. This is a simulated preview — connect the test_system_prompt mutation for live testing.`
    );
    setTestLoading(false);
  }, [testInput]);

  const handleSave = useCallback(async () => {
    const name = typeOption
      ? `${typeOption.label} - ${String(config[typeOption.configFields[0]?.key] ?? "").slice(0, 40)}`
      : "Generated Prompt";

    try {
      const { data } = await createPrompt({
        variables: {
          input: {
            name,
            promptText: generatedPrompt,
            promptType: selectedType,
            visibility: "organization",
            description: `Generated via Prompt Generator (${typeOption?.label ?? selectedType})`,
          },
        },
      });

      if (data?.createSystemPrompt?.prompt) {
        toast.success(`Prompt "${name}" saved`);
        router.push("/system-prompts");
      } else {
        const err =
          data?.createSystemPrompt?.errors?.[0] ?? "Failed to save prompt";
        toast.error(err);
      }
    } catch {
      toast.error("Failed to save prompt");
    }
  }, [createPrompt, generatedPrompt, selectedType, typeOption, config, router]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/system-prompts">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Prompt Generator</h1>
          <p className="text-muted-foreground mt-0.5 text-sm">
            Guided wizard for creating well-structured prompt templates
          </p>
        </div>
      </div>

      {/* Progress indicator */}
      <div className="mx-auto w-full max-w-3xl">
        <StepIndicator current={step} />
      </div>

      {/* Step content */}
      <div className="mx-auto w-full max-w-3xl">
        {/* ── Step 0: Select type ──────────────────────────────────────── */}
        {step === 0 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">
              What type of prompt are you creating?
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROMPT_TYPES.map((t) => {
                const isActive = selectedType === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => {
                      setSelectedType(t.value);
                      setConfig({});
                    }}
                    className={`ring-foreground/10 rounded-xl p-4 text-left ring-1 transition-all ${
                      isActive
                        ? "bg-accent ring-[#37efed]/60 ring-2"
                        : "bg-card hover:bg-accent/50"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted ${t.color}`}
                      >
                        {t.icon}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{t.label}</p>
                          {isActive && (
                            <CheckIcon className="h-4 w-4 text-[#37efed]" />
                          )}
                        </div>
                        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
                          {t.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Step 1: Configure ────────────────────────────────────────── */}
        {step === 1 && typeOption && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg bg-muted ${typeOption.color}`}
              >
                {typeOption.icon}
              </div>
              <h2 className="text-lg font-medium">
                Configure {typeOption.label}
              </h2>
            </div>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-5">
                  {typeOption.configFields.map((field) => (
                    <div key={field.key} className="space-y-1.5">
                      <Label htmlFor={`config-${field.key}`}>
                        {field.label}
                        {field.required && (
                          <span className="text-destructive ml-1">*</span>
                        )}
                      </Label>
                      {field.type === "text" && (
                        <Input
                          id={`config-${field.key}`}
                          value={String(config[field.key] ?? "")}
                          onChange={(e) =>
                            handleConfigChange(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          className="text-sm"
                        />
                      )}
                      {field.type === "textarea" && (
                        <Textarea
                          id={`config-${field.key}`}
                          value={String(config[field.key] ?? "")}
                          onChange={(e) =>
                            handleConfigChange(field.key, e.target.value)
                          }
                          placeholder={field.placeholder}
                          rows={3}
                          className="text-sm"
                        />
                      )}
                      {field.type === "list" && (
                        <ListInput
                          value={
                            Array.isArray(config[field.key])
                              ? (config[field.key] as string[])
                              : []
                          }
                          onChange={(v) => handleConfigChange(field.key, v)}
                          placeholder={field.placeholder}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Step 2: Review ───────────────────────────────────────────── */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-medium">Review Generated Prompt</h2>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                >
                  <SparklesIcon className="mr-1.5 h-3.5 w-3.5" />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(!isEditing)}
                >
                  <PencilIcon className="mr-1.5 h-3.5 w-3.5" />
                  {isEditing ? "Done Editing" : "Edit"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copy(generatedPrompt)}
                >
                  {copied ? (
                    <CheckIcon className="mr-1.5 h-3.5 w-3.5" />
                  ) : (
                    <CopyIcon className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            </div>

            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm">
                      {typeOption?.label ?? "Generated Prompt"}
                    </CardTitle>
                    <Badge variant="outline" className="text-[10px]">
                      {selectedType}
                    </Badge>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    ~{tokenCount.toLocaleString()} tokens
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                {isEditing ? (
                  <Textarea
                    value={generatedPrompt}
                    onChange={(e) => setGeneratedPrompt(e.target.value)}
                    className="min-h-[240px] font-mono text-sm"
                    style={{ lineHeight: "1.7" }}
                    rows={12}
                  />
                ) : (
                  <div className="bg-muted rounded-lg p-4">
                    <pre className="whitespace-pre-wrap font-mono text-sm leading-relaxed">
                      {generatedPrompt}
                    </pre>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ── Step 3: Test ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">Test Your Prompt</h2>

            <div className="grid gap-4 lg:grid-cols-2">
              {/* Prompt preview */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">System Prompt</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="bg-muted max-h-[300px] overflow-y-auto rounded-lg p-3">
                    <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed">
                      {generatedPrompt}
                    </pre>
                  </div>
                </CardContent>
              </Card>

              {/* Test panel */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Try It</CardTitle>
                  <CardDescription className="text-xs">
                    Send a test message to see how the AI would respond with this
                    system prompt
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={testInput}
                      onChange={(e) => setTestInput(e.target.value)}
                      placeholder="Type a test message..."
                      className="text-sm"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleTest();
                        }
                      }}
                    />
                    <Button
                      size="sm"
                      onClick={handleTest}
                      disabled={testLoading || !testInput.trim()}
                      className="shrink-0"
                    >
                      {testLoading ? (
                        <Loader2Icon className="h-4 w-4 animate-spin" />
                      ) : (
                        <SendIcon className="h-4 w-4" />
                      )}
                    </Button>
                  </div>

                  {testResult && (
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-muted-foreground text-xs font-medium">
                        Response preview
                      </p>
                      <p className="mt-1 text-sm leading-relaxed">
                        {testResult}
                      </p>
                    </div>
                  )}

                  {!testResult && !testLoading && (
                    <div className="flex flex-col items-center justify-center py-8 text-center">
                      <PlayIcon className="text-muted-foreground mb-2 h-8 w-8" />
                      <p className="text-muted-foreground text-sm">
                        Send a test message to preview the response
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}

        {/* ── Navigation buttons ───────────────────────────────────────── */}
        <div className="mt-8 flex items-center justify-between border-t pt-4">
          <Button
            variant="outline"
            size="sm"
            onClick={handleBack}
            disabled={step === 0}
          >
            <ArrowLeftIcon className="mr-1.5 h-4 w-4" />
            Back
          </Button>

          <div className="flex items-center gap-2">
            {step === 3 && (
              <Button size="sm" onClick={handleSave} disabled={saving}>
                {saving ? (
                  <Loader2Icon className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <SaveIcon className="mr-1.5 h-4 w-4" />
                )}
                Save Prompt
              </Button>
            )}

            {step < 3 && (
              <Button
                size="sm"
                onClick={handleNext}
                disabled={!canAdvance}
              >
                {step === 2 ? "Test" : "Next"}
                <ArrowRightIcon className="ml-1.5 h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
