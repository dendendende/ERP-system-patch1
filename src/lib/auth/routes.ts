// Which role a page needs. This is the UX guard (proxy.ts); RLS is the real one.

export type Role = "owner" | "operator" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, operator: 1, owner: 2 };

/** Longest matching prefix wins. Anything not listed is open to every signed-in role. */
const ROUTE_ROLES: [prefix: string, role: Role][] = [
  ["/money/import", "operator"],
  ["/settings/team", "owner"],
  ["/settings/audit-log", "owner"],
  ["/settings/categories", "owner"],
];

export function requiredRole(pathname: string): Role {
  let best: [string, Role] | undefined;
  for (const entry of ROUTE_ROLES) {
    const [prefix] = entry;
    const matches = pathname === prefix || pathname.startsWith(prefix + "/");
    if (matches && (!best || prefix.length > best[0].length)) best = entry;
  }
  return best?.[1] ?? "viewer";
}

export function canAccess(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  return RANK[role] >= RANK[requiredRole(pathname)];
}

/** Inactivity timeout. `lastActive` missing means the session just started. */
export function isSessionExpired(
  lastActiveMs: number | null,
  nowMs: number,
  timeoutMinutes: number,
) {
  return lastActiveMs !== null && nowMs - lastActiveMs > timeoutMinutes * 60_000;
}
