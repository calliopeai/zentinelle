import * as React from "react";

/** `value`, once it has held still for `ms`: a search box's input becomes a query's variable. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
