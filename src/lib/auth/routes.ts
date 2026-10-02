// Which role a page needs. This is the UX guard (proxy.ts); RLS is the real one.

export type Role = "owner" | "operator" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, operator: 1, owner: 2 };

/** Longest matching prefix wins. Anything not listed is open to every signed-in role. */
const ROUTE_ROLES: [prefix: string, role: Role][] = [
  ["/money/import", "operator"],
  ["/settings/team", "owner"],
  ["/settings/audit-log", "owner"],
  ["/settings/categories", "owner"],
  ["/settings/reminders", "owner"],
  ["/settings/health", "owner"],
  ["/settings/weekly-summary", "owner"],
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

/** Who may open the forecast — an explicit list, not a rank (the plan: owner and viewer yes,
 * operator no). Set FORECAST_ROLES, e.g. "owner,viewer,operator"; default "owner,viewer". */
export function forecastRoles(env: Record<string, string | undefined> = process.env): Role[] {
  const listed = (env.FORECAST_ROLES ?? "owner,viewer").split(",").map((r) => r.trim());
  return (["owner", "operator", "viewer"] as const).filter((r) => listed.includes(r));
}

/** Pages only certain roles may open, whatever their rank. */
function onlyRoles(pathname: string): Role[] | null {
  return pathname === "/forecast" || pathname.startsWith("/forecast/") ? forecastRoles() : null;
}

/** Does opening this page need the person's role looked up? */
export function isRestricted(pathname: string): boolean {
  return requiredRole(pathname) !== "viewer" || onlyRoles(pathname) !== null;
}

export function canAccess(role: Role | null | undefined, pathname: string): boolean {
  if (!role) return false;
  const only = onlyRoles(pathname);
  if (only) return only.includes(role);
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
