type Catalog = { [key: string]: string | Catalog };

/** `base` with `over` laid on top, key by key at every depth. */
export function deepMerge(base: Catalog, over: Catalog): Catalog {
  const merged: Catalog = { ...base };
  for (const [key, value] of Object.entries(over)) {
    const under = merged[key];
    merged[key] =
      typeof value === "object" && typeof under === "object"
        ? deepMerge(under, value)
        : value;
  }
  return merged;
}
