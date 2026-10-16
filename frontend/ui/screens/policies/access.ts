/** What the signed-in person may do here, from the capabilities `/auth/me` returns (ui-overhaul-ia §4.3). */
export interface Access {
  /** Operator and admin: write policies, rules and prompts; stage changes. */
  canEdit: boolean;
  /** Admin: approve, promote and roll back policy changes. */
  canAdmin: boolean;
}

export function accessOf(capabilities: readonly string[]): Access {
  return {
    canEdit: capabilities.includes("mutate"),
    canAdmin: capabilities.includes("admin"),
  };
}
