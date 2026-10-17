import * as React from "react";

/** The value, once it has held still for `ms`: what a search box sends as a query variable. */
export function useDebounced<T>(value: T, ms = 300): T {
  const [settled, setSettled] = React.useState(value);
  React.useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
