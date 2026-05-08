"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  FileIcon,
  FileTextIcon,
  Loader2Icon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
  WandIcon,
  XIcon,
  AlertTriangleIcon,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

// ── Policy keyword catalogue ──────────────────────────────────────────────
//
// Each entry maps a recognized phrase pattern to a candidate policy with
// sensible default config. The matcher is purposefully fuzzy — it scans
// the doc body for keywords and pulls structured numbers (rates, timeouts,
// thresholds) where possible.

interface PolicyKeyword {
  policyType: string;
  label: string;
  category: string;
  /** keywords that, if present, surface this candidate */
  patterns: RegExp[];
  /** number-pulling regexes — first capture group is the value */
  configExtractors?: Array<{
    field: string;
    regex: RegExp;
    transform?: (raw: string) => unknown;
  }>;
  defaultConfig: Record<string, unknown>;
  defaultEnforcement: "monitor" | "enforce" | "block";
}

const POLICY_KEYWORDS: PolicyKeyword[] = [
  {
    policyType: "rate_limit",
    label: "Rate Limit",
    category: "Traffic",
    patterns: [
      /\brate[-\s]?limit/i,
      /\bthrottl(?:e|ing)/i,
      /\brequests?\s+per\s+(minute|second|hour)/i,
    ],
    configExtractors: [
      {
        field: "requests_per_minute",
        regex: /(\d+)\s*(?:requests?|req)\s*(?:per|\/)\s*(?:minute|min)/i,
        transform: (s) => Number(s),
      },
      {
        field: "requests_per_second",
        regex: /(\d+)\s*(?:requests?|req)\s*(?:per|\/)\s*(?:second|sec)/i,
        transform: (s) => Number(s),
      },
    ],
    defaultConfig: { requests_per_minute: 60 },
    defaultEnforcement: "enforce",
  },
  {
    policyType: "tool_permission",
    label: "Tool Permission",
    category: "Capabilities",
    patterns: [
      /\btool\s+permission/i,
      /\ballow(?:ed)?\s+tools?/i,
      /\bblock(?:ed)?\s+tools?/i,
      /\b(?:must\s+not|cannot)\s+(?:invoke|call|use)\s+tool/i,
    ],
    defaultConfig: { allowed_tools: [], denied_tools: [] },
    defaultEnforcement: "enforce",
  },
  {
    policyType: "output_filter",
    label: "Output Filter",
    category: "Content",
    patterns: [
      /\boutput\s+filter/i,
      /\bredact/i,
      /\bpii\b/i,
      /\bpersonal(?:ly)?\s+identifiable/i,
      /\bsensitive\s+data/i,
    ],
    defaultConfig: { redact_pii: true, redact_secrets: true },
    defaultEnforcement: "enforce",
  },
  {
    policyType: "data_retention",
    label: "Data Retention",
    category: "Lifecycle",
    patterns: [
      /\b(?:data\s+)?retention/i,
      /\bdelete\s+(?:after|within)/i,
      /\bretain\s+(?:for|up\s+to)/i,
    ],
    configExtractors: [
      {
        field: "retention_days",
        regex: /(\d+)\s*days?/i,
        transform: (s) => Number(s),
      },
      {
        field: "retention_days",
        regex: /(\d+)\s*months?/i,
        transform: (s) => Number(s) * 30,
      },
      {
        field: "retention_days",
        regex: /(\d+)\s*years?/i,
        transform: (s) => Number(s) * 365,
      },
    ],
    defaultConfig: { retention_days: 90 },
    defaultEnforcement: "enforce",
  },
  {
    policyType: "ai_guardrail",
    label: "AI Guardrail",
    category: "Safety",
    patterns: [
      /\bguardrail/i,
      /\bjailbreak/i,
      /\bprompt\s+injection/i,
      /\bharmful\s+content/i,
      /\bunsafe\s+output/i,
    ],
    defaultConfig: {
      detect_jailbreak: true,
      detect_prompt_injection: true,
      detect_harmful_content: true,
    },
    defaultEnforcement: "block",
  },
  {
    policyType: "model_allowlist",
    label: "Model Allowlist",
    category: "Models",
    patterns: [
      /\b(?:allow(?:ed|list)|whitelist)\s+models?/i,
      /\bapproved\s+models?/i,
      /\bonly\s+(?:use|allow)\s+(?:the\s+)?(?:following\s+)?models?/i,
    ],
    defaultConfig: { allowed_models: [] },
    defaultEnforcement: "enforce",
  },
  {
    policyType: "cost_cap",
    label: "Cost Cap",
    category: "Budget",
    patterns: [
      /\bcost\s+cap/i,
      /\bbudget/i,
      /\bspend(?:ing)?\s+limit/i,
      /\bmax(?:imum)?\s+(?:cost|spend)/i,
    ],
    configExtractors: [
      {
        field: "monthly_cost_usd",
        regex: /\$?(\d+(?:\.\d+)?)\s*(?:usd|dollars?)?\s*(?:per\s+)?(?:month|mo)/i,
        transform: (s) => Number(s),
      },
      {
        field: "daily_cost_usd",
        regex: /\$?(\d+(?:\.\d+)?)\s*(?:usd|dollars?)?\s*(?:per\s+)?day/i,
        transform: (s) => Number(s),
      },
    ],
    defaultConfig: { monthly_cost_usd: 100 },
    defaultEnforcement: "monitor",
  },
  {
    policyType: "audit_log",
    label: "Audit Logging",
    category: "Observability",
    patterns: [
      /\baudit\s+log/i,
      /\b(?:log|record)\s+(?:all|every)/i,
      /\bobservab(?:ility|le)/i,
    ],
    defaultConfig: { log_inputs: true, log_outputs: true },
    defaultEnforcement: "monitor",
  },
  {
    policyType: "network_allowlist",
    label: "Network Allowlist",
    category: "Network",
    patterns: [
      /\bnetwork\s+(?:policy|allowlist|whitelist)/i,
      /\b(?:allowed|approved)\s+(?:domains?|hosts?|endpoints?|urls?)/i,
      /\begress\s+(?:rules?|control)/i,
    ],
    defaultConfig: { allowed_domains: [] },
    defaultEnforcement: "enforce",
  },
];

interface PolicyCandidate {
  id: string;
  policyType: string;
  label: string;
  category: string;
  matchedSnippet: string;
  config: Record<string, unknown>;
  enforcement: string;
  selected: boolean;
}

// ── File reading ──────────────────────────────────────────────────────────

const ACCEPTED_EXTS = [".pdf", ".md", ".txt", ".docx"];
const ACCEPT_MIME =
  "application/pdf,text/markdown,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,.md,.txt,.pdf,.docx";

type FileKind = "text" | "pdf" | "docx" | "unknown";

function classifyFile(file: File): FileKind {
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (name.endsWith(".docx")) return "docx";
  if (
    name.endsWith(".md") ||
    name.endsWith(".markdown") ||
    name.endsWith(".txt") ||
    file.type === "text/markdown" ||
    file.type === "text/plain"
  ) {
    return "text";
  }
  return "unknown";
}

async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

// ── Extraction logic ──────────────────────────────────────────────────────

function snippetAround(text: string, index: number, span = 90): string {
  const start = Math.max(0, index - span);
  const end = Math.min(text.length, index + span);
  let s = text.slice(start, end).replace(/\s+/g, " ").trim();
  if (start > 0) s = "…" + s;
  if (end < text.length) s = s + "…";
  return s;
}

function extractPolicyCandidates(content: string): PolicyCandidate[] {
  const out: PolicyCandidate[] = [];

  for (const kw of POLICY_KEYWORDS) {
    let matchedIndex = -1;

    for (const pat of kw.patterns) {
      const m = content.match(pat);
      if (m && m.index !== undefined) {
        matchedIndex = m.index;
        break;
      }
    }

    if (matchedIndex === -1) continue;

    // Build config from defaults plus any extracted values
    const config: Record<string, unknown> = { ...kw.defaultConfig };
    if (kw.configExtractors) {
      for (const ex of kw.configExtractors) {
        const m = content.match(ex.regex);
        if (m && m[1]) {
          config[ex.field] = ex.transform ? ex.transform(m[1]) : m[1];
        }
      }
    }

    out.push({
      id: `${kw.policyType}-${matchedIndex}`,
      policyType: kw.policyType,
      label: kw.label,
      category: kw.category,
      matchedSnippet: snippetAround(content, matchedIndex),
      config,
      enforcement: kw.defaultEnforcement,
      selected: true,
    });
  }

  return out;
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function PolicyImportPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<FileKind | null>(null);
  const [pdfNotice, setPdfNotice] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [candidates, setCandidates] = useState<PolicyCandidate[]>([]);
  const [parsed, setParsed] = useState(false);
  const [dragActive, setDragActive] = useState(false);

  const selectedCount = useMemo(
    () => candidates.filter((c) => c.selected).length,
    [candidates]
  );

  // ── File handling ──

  const handleFiles = useCallback(async (file: File) => {
    const kind = classifyFile(file);
    setFileName(file.name);
    setFileKind(kind);
    setPdfNotice(false);
    setCandidates([]);
    setParsed(false);

    if (kind === "text") {
      try {
        const text = await readTextFile(file);
        setContent(text);
        toast.success(`Loaded ${file.name}`);
      } catch {
        toast.error("Failed to read file");
      }
      return;
    }

    if (kind === "pdf") {
      setContent("");
      setPdfNotice(true);
      return;
    }

    if (kind === "docx") {
      setContent("");
      setPdfNotice(true); // Same notice — backend parsing required
      return;
    }

    toast.error("Unsupported file type. Use .pdf, .md, .txt, or .docx");
    setFileKind(null);
    setFileName(null);
  }, []);

  const onFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFiles(file);
    // Reset so the same file can be re-selected
    e.target.value = "";
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFiles(file);
  };

  const clearFile = () => {
    setContent("");
    setFileName(null);
    setFileKind(null);
    setPdfNotice(false);
    setCandidates([]);
    setParsed(false);
  };

  // ── Parse ──

  const handleParse = useCallback(() => {
    if (!content.trim()) {
      toast.error("Paste or upload some policy text first");
      return;
    }
    setParsing(true);
    // Tiny artificial delay so the UI feels deliberate
    setTimeout(() => {
      const result = extractPolicyCandidates(content);
      setCandidates(result);
      setParsed(true);
      setParsing(false);
      if (result.length === 0) {
        toast.warning("No policy keywords found in the document");
      } else {
        toast.success(
          `Found ${result.length} policy candidate${result.length === 1 ? "" : "s"}`
        );
      }
    }, 200);
  }, [content]);

  const toggleCandidate = (id: string) => {
    setCandidates((prev) =>
      prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c))
    );
  };

  const removeCandidate = (id: string) => {
    setCandidates((prev) => prev.filter((c) => c.id !== id));
  };

  // ── Create policies — open create form pre-filled ──

  const handleCreatePolicies = useCallback(() => {
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) {
      toast.error("Select at least one policy candidate");
      return;
    }

    // The create form takes one policy at a time. Pre-fill with the first
    // candidate, and stash the rest in sessionStorage so the user can step
    // through them. This stays consistent with the existing single-policy
    // creation flow.
    const [first, ...rest] = selected;

    if (rest.length > 0) {
      try {
        sessionStorage.setItem(
          "policy-import-queue",
          JSON.stringify(
            rest.map((c) => ({
              name: `${c.label} (Imported)`,
              policyType: c.policyType,
              config: c.config,
              enforcement: c.enforcement,
            }))
          )
        );
      } catch {
        // sessionStorage can fail in private mode; fall back gracefully
      }
    }

    const params = new URLSearchParams();
    params.set("name", `${first.label} (Imported)`);
    params.set("policyType", first.policyType);
    params.set("enforcement", first.enforcement);
    params.set("config", JSON.stringify(first.config, null, 2));
    if (rest.length > 0) params.set("queued", String(rest.length));

    router.push(`/policies/create?${params.toString()}`);
  }, [candidates, router]);

  // ── Render ──

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
          <Link href="/policies">
            <ArrowLeftIcon className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-semibold">Policy Import</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload or paste a policy document to extract candidate governance
            policies. Review, then create policies pre-filled with the
            extracted config.
          </p>
        </div>
      </div>

      {/* ── Step 1: source ─────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">1. Source document</CardTitle>
          <CardDescription className="text-xs">
            Drop a file or paste content. Supported types: .md, .txt, .pdf,
            .docx (PDF/DOCX require backend parsing — paste text for now).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Drop zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
            className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragActive
                ? "border-[#37efed] bg-[#37efed]/5"
                : "border-border bg-muted/30"
            }`}
          >
            <UploadIcon className="text-muted-foreground h-7 w-7" />
            <div className="text-sm">
              <span className="font-medium">Drop a file here</span>
              <span className="text-muted-foreground"> or </span>
              <button
                type="button"
                className="text-[#0e9b95] hover:underline dark:text-[#37efed]"
                onClick={() => fileInputRef.current?.click()}
              >
                browse
              </button>
            </div>
            <p className="text-muted-foreground text-xs">
              Accepted: {ACCEPTED_EXTS.join(", ")}
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_MIME}
              className="hidden"
              onChange={onFilePick}
            />
          </div>

          {/* File chip */}
          {fileName && (
            <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2">
              <div className="flex items-center gap-2">
                {fileKind === "text" ? (
                  <FileTextIcon className="text-muted-foreground h-4 w-4" />
                ) : (
                  <FileIcon className="text-muted-foreground h-4 w-4" />
                )}
                <span className="text-sm font-medium">{fileName}</span>
                {fileKind && (
                  <Badge variant="outline" className="text-[10px]">
                    {fileKind}
                  </Badge>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={clearFile}
                className="h-7 px-2"
              >
                <XIcon className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}

          {/* PDF / docx notice */}
          {pdfNotice && (
            <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              <AlertTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <p className="font-medium">
                  {fileKind === "pdf" ? "PDF" : "DOCX"} parsing requires
                  backend setup
                </p>
                <p className="mt-0.5 opacity-90">
                  Open the document, copy its contents, and paste them into
                  the text area below. Server-side document ingestion is on
                  the roadmap.
                </p>
              </div>
            </div>
          )}

          {/* Text content */}
          <div className="space-y-2">
            <Label htmlFor="content" className="text-xs font-medium">
              Document content
            </Label>
            <Textarea
              id="content"
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                if (parsed) {
                  setParsed(false);
                  setCandidates([]);
                }
              }}
              placeholder="Paste your policy document here, or upload a markdown/text file above…"
              rows={10}
              className="font-mono text-sm"
            />
            <div className="text-muted-foreground flex justify-between text-xs">
              <span>{content.length.toLocaleString()} characters</span>
              <span>{content.split(/\s+/).filter(Boolean).length} words</span>
            </div>
          </div>

          {/* Parse button */}
          <div className="flex items-center gap-2">
            <Button onClick={handleParse} disabled={!content.trim() || parsing}>
              {parsing ? (
                <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <WandIcon className="mr-2 h-4 w-4" />
              )}
              Parse
            </Button>
            {parsed && (
              <span className="text-muted-foreground text-xs">
                Found {candidates.length} candidate
                {candidates.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* ── Step 2: candidates ─────────────────────────────────────────── */}
      {parsed && (
        <Card>
          <CardHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <CardTitle className="text-sm">
                  2. Extracted policy candidates
                </CardTitle>
                <CardDescription className="text-xs">
                  Review what was detected. Uncheck anything you don&apos;t want
                  to import. Each policy will be created via the standard
                  create form so you can fine-tune the config.
                </CardDescription>
              </div>
              {candidates.length > 0 && (
                <div className="text-muted-foreground shrink-0 text-xs">
                  {selectedCount} of {candidates.length} selected
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {candidates.length === 0 ? (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-8 text-center text-sm">
                <AlertTriangleIcon className="h-6 w-6 opacity-40" />
                <p>
                  No policy keywords were detected in the document. Try
                  rewording the source text or pasting a more detailed
                  policy.
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {candidates.map((c) => (
                  <li
                    key={c.id}
                    className={`rounded-lg border p-4 transition-colors ${
                      c.selected ? "bg-card" : "bg-muted/30 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={c.selected}
                        onChange={() => toggleCandidate(c.id)}
                        className="mt-1 h-4 w-4 cursor-pointer accent-[#37efed]"
                        aria-label={`Toggle ${c.label}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-medium">{c.label}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {c.policyType}
                          </Badge>
                          <Badge
                            variant="secondary"
                            className="text-[10px]"
                          >
                            {c.category}
                          </Badge>
                          <Badge
                            variant={
                              c.enforcement === "block"
                                ? "destructive"
                                : c.enforcement === "enforce"
                                  ? "default"
                                  : "secondary"
                            }
                            className="text-[10px]"
                          >
                            {c.enforcement}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-2 text-xs italic">
                          &ldquo;{c.matchedSnippet}&rdquo;
                        </p>
                        <pre className="bg-muted mt-2 max-h-28 overflow-auto rounded-md p-2 font-mono text-[11px] leading-relaxed">
                          {JSON.stringify(c.config, null, 2)}
                        </pre>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => removeCandidate(c.id)}
                        className="h-7 w-7 shrink-0 p-0"
                        aria-label={`Remove ${c.label}`}
                      >
                        <TrashIcon className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {candidates.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
                <div className="text-muted-foreground flex items-center gap-2 text-xs">
                  <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
                  Ready to create {selectedCount} polic
                  {selectedCount === 1 ? "y" : "ies"}
                </div>
                <Button
                  onClick={handleCreatePolicies}
                  disabled={selectedCount === 0}
                >
                  <PlusIcon className="mr-1.5 h-4 w-4" />
                  Create policies
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
