import Link from "next/link";
import { Button, Card, StatusPill } from "@/components/ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { setTwoFactor } from "./actions";
import { InviteForm, MemberControls } from "./team-forms";

export const metadata = { title: "Team · Settings · Cashflow" };

const ROLE_NAME = { owner: "Owner", operator: "Operator", viewer: "Viewer" } as const;

export default async function TeamPage() {
  const supabase = await createClient();
  const {
    data: { user: me },
  } = await supabase.auth.getUser();
  const { data: people, error } = await supabase
    .from("users")
    .select("id, name, role, is_active")
    .order("is_active", { ascending: false })
    .order("name");
  const { data: twoFactor } = await supabase.rpc("two_factor_required");
  // Owner-only page (proxy). Email and whether someone finished joining (2-step sign-in set up)
  // live in the auth system; one lookup per person — listUsers leaves out the 2FA factors.
  const admin = createAdminClient();
  const logins = await Promise.all(
    (people ?? []).map(async (p) => (await admin.auth.admin.getUserById(p.id)).data.user),
  );
  const login = new Map(logins.flatMap((u) => (u ? [[u.id, u] as const] : [])));

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Link href="/settings" className="text-sm text-muted underline underline-offset-4">
          ← Settings
        </Link>
        <h1 className="font-display text-3xl md:text-4xl">Team</h1>
        <p className="text-muted">
          Who can use the app and what they can do. A change works straight away. People are
          switched off, never removed, so their name stays on everything they did.
        </p>
      </div>

      <Card className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl">2-step sign-in</h2>
          {twoFactor === false ? (
            <StatusPill tone="attention">Off</StatusPill>
          ) : (
            <StatusPill tone="in">Required for everyone</StatusPill>
          )}
        </div>
        <p className="text-sm text-muted">
          {twoFactor === false
            ? "Signing in needs only the password. Fine while you work alone; switch it on before you add people or go live."
            : "Signing in needs the password and a 6-digit code from a phone app. This app handles the company's money, so keep it on once there's a team."}
        </p>
        <form action={setTwoFactor}>
          <input type="hidden" name="required" value={String(twoFactor === false)} />
          <Button type="submit" variant="secondary">
            {twoFactor === false ? "Switch on for everyone" : "Switch off for now"}
          </Button>
        </form>
      </Card>

      <Card className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Add someone</h2>
        <InviteForm />
      </Card>

      {error ? (
        <p className="text-sm text-problem">Couldn&apos;t load the team. Try again.</p>
      ) : (
        <Card className="p-0">
          <ul>
            {(people ?? []).map((p) => {
              const auth = login.get(p.id);
              const joined = !!auth?.factors?.some((f) => f.status === "verified");
              return (
                <li
                  key={p.id}
                  className="flex flex-col gap-3 border-b border-line px-5 py-4 last:border-b-0"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-medium">
                        {p.name || "No name yet"}
                        {p.id === me?.id ? <span className="text-muted"> (you)</span> : null}
                      </p>
                      <p className="text-sm text-muted">{auth?.email}</p>
                    </div>
                    <div className="flex gap-2">
                      {!p.is_active ? (
                        <StatusPill tone="problem">Switched off</StatusPill>
                      ) : !joined ? (
                        <StatusPill tone="attention">Hasn&apos;t joined yet</StatusPill>
                      ) : null}
                      <StatusPill>{ROLE_NAME[p.role]}</StatusPill>
                    </div>
                  </div>
                  <MemberControls id={p.id} role={p.role} active={p.is_active} joined={joined} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </div>
  );
}
