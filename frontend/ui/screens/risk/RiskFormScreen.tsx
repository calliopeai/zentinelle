import {
  Button,
  ErrorState,
  Input,
  PageFrame,
  Section,
  useUI,
} from "@calliopelabs/ui";
import * as React from "react";

import type { CreateRiskInput, RiskData } from "@/graphql/risks/types";

import { AccessState } from "../../patterns/AccessState";
import { Field, Select, Textarea } from "../../patterns/form";
import { RiskLevelBadge } from "./components/RiskLevelBadge";
import {
  IMPACT,
  LIKELIHOOD,
  RISK_CATEGORIES,
  RISK_STATUSES,
  areaCrumb,
  canMutate,
} from "./model";

export interface RiskFormScreenProps {
  capabilities: readonly string[];
  /** Absent: New risk (`CreateRisk`). Present: Edit (`UpdateRisk`). */
  risk?: RiskData | null;
  /**
   * Saves the input; resolves with the server's `errors` (empty on success).
   * The route navigates to the risk after a save that succeeded.
   */
  onSubmit: (input: CreateRiskInput) => Promise<readonly string[]>;
}

const scale = (items: typeof LIKELIHOOD | typeof IMPACT) =>
  items.map((item) => ({
    value: String(item.value),
    label: `${item.label} (${item.value})`,
  }));

/** RPN as the backend computes its level: thresholds at 18, 75 and 200. */
function levelOf(score: number) {
  return score >= 200
    ? "critical"
    : score >= 75
      ? "high"
      : score >= 18
        ? "medium"
        : "low";
}

/**
 * New risk, and Edit: one form. Likelihood and impact use the backend's
 * Fibonacci scales; residual values are optional until a mitigation exists.
 * The score preview is likelihood x impact x a moderate severity, which the
 * form does not set; the saved RPN is the server's.
 */
export function RiskFormScreen({
  capabilities,
  risk,
  onSubmit,
}: RiskFormScreenProps) {
  const { Link } = useUI();
  const editing = Boolean(risk);
  const [values, setValues] = React.useState(() => ({
    name: risk?.name ?? "",
    description: risk?.description ?? "",
    category: risk?.category ?? "security",
    status: risk?.status ?? "identified",
    likelihood: String(risk?.likelihood ?? 3),
    impact: String(risk?.impact ?? 3),
    mitigationPlan: risk?.mitigationPlan ?? "",
    mitigationStatus: risk?.mitigationStatus ?? "",
    residualLikelihood: risk?.residualLikelihood
      ? String(risk.residualLikelihood)
      : "",
    residualImpact: risk?.residualImpact ? String(risk.residualImpact) : "",
    nextReviewDate: risk?.nextReviewDate ?? "",
  }));
  const [touched, setTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [serverErrors, setServerErrors] = React.useState<readonly string[]>([]);
  const crumbs = [
    areaCrumb("risks", capabilities),
    { label: "Register", href: "/risks" },
  ];
  const title = editing ? `Edit ${risk?.name}` : "New risk";

  if (!canMutate(capabilities))
    return (
      <PageFrame crumbs={crumbs} title={editing ? "Edit risk" : "New risk"}>
        <AccessState
          subject="Changing risks"
          role="operator"
          homeHref="/risks"
          homeLabel="Back to the register"
        />
      </PageFrame>
    );

  const set =
    (key: keyof typeof values) =>
    (
      event: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >,
    ) =>
      setValues((v) => ({ ...v, [key]: event.target.value }));
  const errors = {
    name: values.name.trim() ? null : "A risk needs a name.",
    description: values.description.trim()
      ? null
      : "Describe what could happen.",
    residual:
      Boolean(values.residualLikelihood) !== Boolean(values.residualImpact)
        ? "Set both residual values, or neither."
        : null,
  };
  const invalid = Object.values(errors).some(Boolean);
  const preview = Number(values.likelihood) * Number(values.impact) * 3;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setTouched(true);
    if (invalid) return;
    setPending(true);
    try {
      setServerErrors(
        await onSubmit({
          name: values.name.trim(),
          description: values.description.trim(),
          category: values.category,
          status: values.status,
          likelihood: Number(values.likelihood),
          impact: Number(values.impact),
          mitigationPlan: values.mitigationPlan || null,
          mitigationStatus: values.mitigationStatus || null,
          residualLikelihood: values.residualLikelihood
            ? Number(values.residualLikelihood)
            : null,
          residualImpact: values.residualImpact
            ? Number(values.residualImpact)
            : null,
          nextReviewDate: values.nextReviewDate || null,
        }),
      );
    } catch (reason) {
      setServerErrors([
        reason instanceof Error ? reason.message : String(reason),
      ]);
    } finally {
      setPending(false);
    }
  }

  const show = (message: string | null) => (touched ? message : null);
  return (
    <PageFrame
      crumbs={crumbs}
      title={<span className="[overflow-wrap:anywhere]">{title}</span>}
    >
      <form
        onSubmit={submit}
        noValidate
        className="flex max-w-3xl flex-col gap-8"
      >
        {serverErrors.length > 0 && (
          <ErrorState
            title={
              editing ? "Could not save the risk" : "Could not create the risk"
            }
            error={serverErrors.join(" ")}
          />
        )}
        <Section title="The risk" headingLevel="h2">
          <Field label="Name" required error={show(errors.name)}>
            <Input value={values.name} onChange={set("name")} maxLength={255} />
          </Field>
          <Field label="Description" required error={show(errors.description)}>
            <Textarea
              value={values.description}
              onChange={set("description")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category">
              <Select
                options={RISK_CATEGORIES}
                value={values.category}
                onChange={set("category")}
              />
            </Field>
            <Field label="Status">
              <Select
                options={RISK_STATUSES}
                value={values.status}
                onChange={set("status")}
              />
            </Field>
          </div>
        </Section>
        <Section
          title="Assessment"
          action={<RiskLevelBadge level={levelOf(preview)} score={preview} />}
          description="Before any mitigation. The preview assumes moderate severity."
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Likelihood">
              <Select
                options={scale(LIKELIHOOD)}
                value={values.likelihood}
                onChange={set("likelihood")}
              />
            </Field>
            <Field label="Impact">
              <Select
                options={scale(IMPACT)}
                value={values.impact}
                onChange={set("impact")}
              />
            </Field>
          </div>
        </Section>
        <Section
          title="Mitigation"
          description="Optional until there is a plan."
        >
          <Field label="Plan">
            <Textarea
              value={values.mitigationPlan}
              onChange={set("mitigationPlan")}
            />
          </Field>
          <Field label="Progress" hint="Where the plan stands, in a line.">
            <Input
              value={values.mitigationStatus}
              onChange={set("mitigationStatus")}
              maxLength={255}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Residual likelihood" error={show(errors.residual)}>
              <Select
                options={scale(LIKELIHOOD)}
                placeholder="Not assessed"
                value={values.residualLikelihood}
                onChange={set("residualLikelihood")}
              />
            </Field>
            <Field label="Residual impact">
              <Select
                options={scale(IMPACT)}
                placeholder="Not assessed"
                value={values.residualImpact}
                onChange={set("residualImpact")}
              />
            </Field>
          </div>
          <Field label="Next review">
            <Input
              type="date"
              value={values.nextReviewDate}
              onChange={set("nextReviewDate")}
              className="sm:w-48"
            />
          </Field>
        </Section>
        <div className="flex gap-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving" : editing ? "Save changes" : "Create risk"}
          </Button>
          <Button variant="outline" asChild>
            <Link href={risk ? `/risks/${risk.id}` : "/risks"}>Cancel</Link>
          </Button>
        </div>
      </form>
    </PageFrame>
  );
}
