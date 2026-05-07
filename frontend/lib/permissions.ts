export async function requirePermission(_slug: string): Promise<void> {
  // RBAC is handled server-side via Django roles.
}

export function checkPermission(_slug: string): boolean {
  return true;
}
