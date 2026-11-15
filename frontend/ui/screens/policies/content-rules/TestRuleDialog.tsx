import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Field,
  Textarea,
} from "@calliopelabs/ui";
import * as React from "react";
import { useTranslations } from "next-intl";

import type { TestContentRulePayload } from "@/graphql/content-rules/types";

import { CodeBlock } from "../../../shared/CodeBlock";

export interface TestRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleName: string;
  /** `TestContentRule`: runs the rule on the text; nothing is recorded. */
  onTest: (content: string) => Promise<TestContentRulePayload>;
}

/** Try a rule on sample text before trusting it with real traffic. */
export function TestRuleDialog({
  open,
  onOpenChange,
  ruleName,
  onTest,
}: TestRuleDialogProps) {
  const t = useTranslations("policies.testRuleDialog");
  const [content, setContent] = React.useState("");
  const [result, setResult] = React.useState<TestContentRulePayload | null>(
    null,
  );
  const [failure, setFailure] = React.useState<string | null>(null);
  const [running, setRunning] = React.useState(false);

  const run = async (event: React.FormEvent) => {
    event.preventDefault();
    setRunning(true);
    setFailure(null);
    try {
      const r = await onTest(content);
      if (r.success === false)
        setFailure(r.errors.join(" ") || t("theRuleCouldNotBe"));
      else setResult(r);
    } catch (e) {
      setFailure(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="[overflow-wrap:anywhere]">
            Test {ruleName}
          </DialogTitle>
          <DialogDescription>{t("theTextIsCheckedAnd")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={run} className="flex flex-col gap-3">
          <Field label={t("sampleText")}>
            <Textarea
              className="min-h-24 py-2"
              rows={5}
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </Field>
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={running || !content.trim()}
          >
            {running ? t("testing") : t("test")}
          </Button>
        </form>
        <div aria-live="polite" className="flex flex-col gap-2">
          {failure && (
            <p role="alert" className="text-sm text-danger">
              {failure}
            </p>
          )}
          {result && !failure && (
            <>
              <p className="text-sm font-medium">
                {result.matched
                  ? t("matched", { count: result.matches?.length ?? 0 })
                  : t("noMatch")}
              </p>
              {result.matched &&
                result.matches &&
                result.matches.length > 0 && (
                  <CodeBlock
                    label={t("matches")}
                    value={result.matches}
                    maxHeight="sm"
                  />
                )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
