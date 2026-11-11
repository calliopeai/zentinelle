import { cn, useUI } from "@calliopelabs/ui";

export interface ViewOption {
  key: string;
  label: string;
  href: string;
}

export interface ViewSwitchProps {
  /** Names the group ("Register views"). */
  label: string;
  views: readonly ViewOption[];
  active: string;
  className?: string;
}

/**
 * The views of one list (List, Matrix, By RPN) when the page's one row of
 * tabs is already taken by its functions. Links, so a view can be shared;
 * the current one carries `aria-current`. A candidate for @calliopelabs/ui.
 */
export function ViewSwitch({
  label,
  views,
  active,
  className,
}: ViewSwitchProps) {
  const { Link } = useUI();
  return (
    <nav aria-label={label} className={cn("flex", className)}>
      <ul className="inline-flex rounded-lg border p-0.5">
        {views.map((view) => {
          const current = view.key === active;
          return (
            <li key={view.key}>
              <Link
                href={view.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "block rounded-md px-3 py-1 text-sm whitespace-nowrap outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  current
                    ? "bg-secondary text-secondary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {view.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
