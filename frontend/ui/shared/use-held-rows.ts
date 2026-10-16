import * as React from "react";

/**
 * A live list that does not move under the reader: rows that arrive after
 * the first answer are held until `release`, and counted for a NewRowsPill.
 * Change `resetKey` (the filters, say) to start over with whatever the next
 * answer holds.
 */
export function useHeldRows<TRow>(
  incoming: readonly TRow[],
  getId: (row: TRow) => string,
  resetKey = "",
): { rows: TRow[]; heldCount: number; release: () => void } {
  const [shown, setShown] = React.useState<{
    key: string;
    ids: Set<string>;
  } | null>(null);

  // Adjusting state while rendering (React's documented pattern): the first
  // answer for a key is shown whole.
  if ((shown === null || shown.key !== resetKey) && incoming.length > 0) {
    setShown({ key: resetKey, ids: new Set(incoming.map(getId)) });
  }

  const ids = shown?.key === resetKey ? shown.ids : null;
  const rows = ids
    ? incoming.filter((row) => ids.has(getId(row)))
    : [...incoming];
  return {
    rows,
    heldCount: incoming.length - rows.length,
    release: () =>
      setShown({ key: resetKey, ids: new Set(incoming.map(getId)) }),
  };
}
