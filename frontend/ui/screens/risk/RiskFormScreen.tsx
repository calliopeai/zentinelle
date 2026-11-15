import {
  Button,
  ErrorState,
  Input,
  PageFrame,
  Section,
  useUI,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { CreateRiskInput, RiskData } from "@/graphql/risks/types";

import { AccessState } from "../../patterns/AccessState";
import { Field, Select, Textarea } from "../../patterns/form";
import { RiskLevelBadge } from "./components/RiskLevelBadge";
import { areaCrumb, canMutate, useRiskLabels } from "./model";

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

const scale = (items: readonly { value: number; label: string }[]) =>
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
  const t = useTranslations("risk.riskFormScreen");
  const { IMPACT, LIKELIHOOD, RISK_CATEGORIES, RISK_STATUSES } =
    useRiskLabels();
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
    { label: t("register"), href: "/risks" },
  ];
  const title = editing ? `Edit ${risk?.name}` : t("newRisk");

  if (!canMutate(capabilities))
    return (
      <PageFrame crumbs={crumbs} title={editing ? t("editRisk") : t("newRisk")}>
        <AccessState
          subject={t("changingRisks")}
          role="operator"
          homeHref="/risks"
          homeLabel={t("backToRegister")}
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
    name: values.name.trim() ? null : t("aRiskNeedsAName"),
    description: values.description.trim()
      ? null
      : t("describeWhatCouldHappen"),
    residual:
      Boolean(values.residualLikelihood) !== Boolean(values.residualImpact)
        ? t("setBothResidualValuesOr")
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
              editing ? t("couldNotSaveTheRisk") : t("couldNotCreateTheRisk")
            }
            error={serverErrors.join(" ")}
          />
        )}
        <Section title={t("theRisk")} headingLevel="h2">
          <Field label={t("name")} required error={show(errors.name)}>
            <Input value={values.name} onChange={set("name")} maxLength={255} />
          </Field>
          <Field
            label={t("description")}
            required
            error={show(errors.description)}
          >
            <Textarea
              value={values.description}
              onChange={set("description")}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("category")}>
              <Select
                options={RISK_CATEGORIES}
                value={values.category}
                onChange={set("category")}
              />
            </Field>
            <Field label={t("status")}>
              <Select
                options={RISK_STATUSES}
                value={values.status}
                onChange={set("status")}
              />
            </Field>
          </div>
        </Section>
        <Section
          title={t("assessment")}
          action={<RiskLevelBadge level={levelOf(preview)} score={preview} />}
          description={t("beforeAnyMitigationThePreview")}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t("likelihood")}>
              <Select
                options={scale(LIKELIHOOD)}
                value={values.likelihood}
                onChange={set("likelihood")}
              />
            </Field>
            <Field label={t("impact")}>
              <Select
                options={scale(IMPACT)}
                value={values.impact}
                onChange={set("impact")}
              />
            </Field>
          </div>
        </Section>
        <Section
          title={t("mitigation")}
          description={t("optionalUntilThereIsA")}
        >
          <Field label={t("plan")}>
            <Textarea
              value={values.mitigationPlan}
              onChange={set("mitigationPlan")}
            />
          </Field>
          <Field label={t("progress")} hint={t("whereThePlanStandsIn")}>
            <Input
              value={values.mitigationStatus}
              onChange={set("mitigationStatus")}
              maxLength={255}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={t("residualLikelihood")}
              error={show(errors.residual)}
            >
              <Select
                options={scale(LIKELIHOOD)}
                placeholder={t("notAssessed")}
                value={values.residualLikelihood}
                onChange={set("residualLikelihood")}
              />
            </Field>
            <Field label={t("residualImpact")}>
              <Select
                options={scale(IMPACT)}
                placeholder={t("notAssessed")}
                value={values.residualImpact}
                onChange={set("residualImpact")}
              />
            </Field>
          </div>
          <Field label={t("nextReview")}>
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
            {pending
              ? t("saving")
              : editing
                ? t("saveChanges")
                : t("createRisk")}
          </Button>
          <Button variant="outline" asChild>
            <Link href={risk ? `/risks/${risk.id}` : "/risks"}>
              {t("cancel")}
            </Link>
          </Button>
        </div>
      </form>
    </PageFrame>
  );
}
