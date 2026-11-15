import { Select, type SelectOption, cn } from "@calliopelabs/ui";
import { useTranslations } from "next-intl";
import * as React from "react";

import { ANY, fromSelectValue, toSelectValue } from "./select-any";

export interface FilterSelectProps {
  /** Names the filter ("Status"); visible, so the bar reads without opening anything. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** The option that clears the filter. Defaults to `common.all`. */
  allLabel?: string;
  className?: string;
}

/**
 * One filter in a list's filter bar, for a query variable the server
 * filters on. The empty value means "no filter".
 */
export function FilterSelect({
  label,
  value,
  onChange,
  options,
  allLabel,
  className,
}: FilterSelectProps) {
  const t = useTranslations("common");
  const id = React.useId();
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label htmlFor={id} className="text-muted-foreground text-xs">
        {label}
      </label>
      <Select
        id={id}
        value={toSelectValue(value)}
        onValueChange={(next) => onChange(fromSelectValue(next))}
        options={[{ value: ANY, label: allLabel ?? t("all") }, ...options]}
      />
    </div>
  );
}
