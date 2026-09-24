"use client";

import { PlusIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// The one ordered action set policies and content rules share (#396), from
// least to most disruptive. The backend validates the same rules; these lists
// only drive the pickers.
export const ACTIONS = [
  { value: "log", label: "Log", hint: "Record only" },
  { value: "alert", label: "Alert", hint: "Record and notify owners" },
  { value: "warn", label: "Warn", hint: "Allow, with a visible warning" },
  { value: "steer", label: "Steer", hint: "Inject a correcting message" },
  { value: "redact", label: "Redact", hint: "Remove the matched content" },
  { value: "require_approval", label: "Require approval", hint: "Hold for a human decision" },
  { value: "block", label: "Block", hint: "Stop the action" },
];

export const BLOCK_LEVELS = [
  { value: "tool_call", label: "Block the tool call" },
  { value: "turn", label: "Cancel the turn" },
  { value: "revoke_key", label: "Revoke the gateway key" },
  { value: "stop", label: "Stop the task or box" },
  { value: "quarantine", label: "Quarantine the agent or spec" },
];

const SEVERITIES = ["info", "low", "medium", "high", "critical"];

type Step = { action: string; block_level?: string };
type RepeatStep = Step & { count: number };
type SeverityStep = Step & { min_severity: string };

export type Escalation = {
  window_seconds?: number;
  repeat?: RepeatStep[];
  severity?: SeverityStep[];
};

export type ActionValue = {
  action: string;
  blockLevel: string;
  steerMessage: string;
  escalation: Escalation;
};

export function actionValueFrom(
  source?: {
    action?: string | null;
    blockLevel?: string | null;
    steerMessage?: string | null;
    escalation?: Record<string, unknown> | null;
  } | null,
  defaultAction = "block",
): ActionValue {
  return {
    action: source?.action || defaultAction,
    blockLevel: source?.blockLevel || "tool_call",
    steerMessage: source?.steerMessage || "",
    escalation: (source?.escalation as Escalation) || {},
  };
}

/** The mutation input fields: steps left empty are dropped, the backend checks the rest. */
export function actionInput(value: ActionValue) {
  const escalation: Escalation = {};
  if (value.escalation.repeat?.length) {
    escalation.window_seconds = value.escalation.window_seconds ?? 3600;
    escalation.repeat = value.escalation.repeat;
  }
  if (value.escalation.severity?.length) {
    escalation.severity = value.escalation.severity;
  }
  return {
    action: value.action,
    blockLevel: value.blockLevel,
    steerMessage: value.steerMessage,
    escalation,
  };
}

function ActionSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ACTIONS.map((a) => (
          <SelectItem key={a.value} value={a.value}>
            {a.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function BlockLevelSelect({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {BLOCK_LEVELS.map((b) => (
          <SelectItem key={b.value} value={b.value}>
            {b.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function StepAction<T extends Step>({
  step,
  onChange,
  label,
}: {
  step: T;
  onChange: (step: T) => void;
  label: string;
}) {
  return (
    <>
      <ActionSelect
        label={`${label} action`}
        value={step.action}
        onChange={(action) =>
          onChange({
            ...step,
            action,
            block_level: action === "block" ? step.block_level || "tool_call" : undefined,
          })
        }
      />
      {step.action === "block" && (
        <BlockLevelSelect
          label={`${label} block level`}
          value={step.block_level || "tool_call"}
          onChange={(block_level) => onChange({ ...step, block_level })}
        />
      )}
    </>
  );
}

/**
 * What a rule does when it matches: an action, a block level for blocks, a
 * steer message, and optional escalation by repeats (per agent, within a
 * window) and by severity. Escalation only goes up; the backend refuses a
 * step that is not stronger than the one before it.
 */
export function ActionFields({
  value,
  onChange,
}: {
  value: ActionValue;
  onChange: (value: ActionValue) => void;
}) {
  const repeat = value.escalation.repeat ?? [];
  const severity = value.escalation.severity ?? [];
  const steers =
    value.action === "steer" ||
    [...repeat, ...severity].some((step) => step.action === "steer");
  const setEscalation = (escalation: Escalation) => onChange({ ...value, escalation });
  const hint = ACTIONS.find((a) => a.value === value.action)?.hint;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Action on a match</Label>
          <ActionSelect
            label="Action on a match"
            value={value.action}
            onChange={(action) => onChange({ ...value, action })}
          />
          {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
        </div>
        {value.action === "block" && (
          <div className="space-y-2">
            <Label>Block level</Label>
            <BlockLevelSelect
              label="Block level"
              value={value.blockLevel}
              onChange={(blockLevel) => onChange({ ...value, blockLevel })}
            />
          </div>
        )}
      </div>

      {steers && (
        <div className="space-y-2">
          <Label htmlFor="steer-message">Steer message</Label>
          <Textarea
            id="steer-message"
            rows={2}
            placeholder="That path is outside your brief; stop and revert."
            value={value.steerMessage}
            onChange={(e) => onChange({ ...value, steerMessage: e.target.value })}
          />
          <p className="text-muted-foreground text-xs">
            Placeholders: {"{rule}"}, {"{reason}"}, {"{action}"}, {"{tool}"}, {"{agent}"}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Escalate on repeats</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setEscalation({
                ...value.escalation,
                window_seconds: value.escalation.window_seconds ?? 3600,
                repeat: [
                  ...repeat,
                  { count: (repeat[repeat.length - 1]?.count ?? 1) + 1, action: "block", block_level: "tool_call" },
                ],
              })
            }
          >
            <PlusIcon className="mr-1 h-3 w-3" /> Add step
          </Button>
        </div>
        {repeat.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <Input
              type="number"
              min={2}
              className="w-20"
              aria-label="Matches"
              value={step.count}
              onChange={(e) => {
                const next = [...repeat];
                next[index] = { ...step, count: Number(e.target.value) };
                setEscalation({ ...value.escalation, repeat: next });
              }}
            />
            <span className="text-muted-foreground shrink-0 text-xs">matches</span>
            <StepAction
              label={`Repeat step ${index + 1}`}
              step={step}
              onChange={(changed) => {
                const next = [...repeat];
                next[index] = changed;
                setEscalation({ ...value.escalation, repeat: next });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove step"
              onClick={() =>
                setEscalation({ ...value.escalation, repeat: repeat.filter((_, i) => i !== index) })
              }
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {repeat.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-xs">within</span>
            <Input
              type="number"
              min={1}
              className="w-24"
              aria-label="Window in minutes"
              value={Math.round((value.escalation.window_seconds ?? 3600) / 60)}
              onChange={(e) =>
                setEscalation({ ...value.escalation, window_seconds: Number(e.target.value) * 60 })
              }
            />
            <span className="text-muted-foreground text-xs">minutes, counted per agent</span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Escalate by severity</Label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() =>
              setEscalation({
                ...value.escalation,
                severity: [...severity, { min_severity: "high", action: "block", block_level: "tool_call" }],
              })
            }
          >
            <PlusIcon className="mr-1 h-3 w-3" /> Add step
          </Button>
        </div>
        {severity.map((step, index) => (
          <div key={index} className="flex items-center gap-2">
            <Select
              value={step.min_severity}
              onValueChange={(min_severity) => {
                const next = [...severity];
                next[index] = { ...step, min_severity };
                setEscalation({ ...value.escalation, severity: next });
              }}
            >
              <SelectTrigger className="w-28" aria-label="Minimum severity">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s} or above
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <StepAction
              label={`Severity step ${index + 1}`}
              step={step}
              onChange={(changed) => {
                const next = [...severity];
                next[index] = changed;
                setEscalation({ ...value.escalation, severity: next });
              }}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove step"
              onClick={() =>
                setEscalation({ ...value.escalation, severity: severity.filter((_, i) => i !== index) })
              }
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
