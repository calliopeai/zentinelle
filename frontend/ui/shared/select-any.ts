/**
 * The @calliopelabs/ui Select (Radix) has no option with an empty value, so
 * an "Any", "All" or "None" option that stands for "" in Zentinelle's state
 * takes this value in the select instead.
 */
export const ANY = "__any__";

/** The select's value for a state value: "" becomes ANY. */
export const toSelectValue = (value: string) => value || ANY;

/** The state value for the select's value: ANY becomes "". */
export const fromSelectValue = (value: string) => (value === ANY ? "" : value);
