import Link from "next/link";
import { Button, Card, EmptyState, StatusPill } from "@/components/ui";
import { staleAfterHours, syncState, timeAgo } from "@/lib/bank/sync-status";
import { createClient } from "@/lib/supabase/server";
import { setAccountActive } from "./actions";
import { AddAccountForm } from "./add-account-form";

export const metadata = { title: "Bank connections · Cashflow" };

export default async function BankConnectionsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: accounts }, { data: me }] = await Promise.all([
    supabase
      .from("bank_accounts")
      .select("id, bank_name, account_name, account_last4, source, last_synced_at, is_active")
      .order("is_active", { ascending: false })
      .order("bank_name"),
    supabase
      .from("users")
      .select("role")
      .eq("id", user?.id ?? "")
      .maybeSingle(),
  ]);
  const isOwner = me?.role === "owner";
  const now = new Date();
  const staleHours = staleAfterHours();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">Bank connections</h1>
        <p className="text-sm text-muted">
          Where your money data comes from. The app only reads your bank — it can never move money.
        </p>
      </div>

      {accounts?.length ? (
        <Card className="flex flex-col gap-4 p-0">
          {accounts.map((a) => {
            const connected = a.source === "aggregator";
            const state = syncState(
              {
                connectedAccounts: connected && a.is_active ? 1 : 0,
                lastSyncedAt: a.last_synced_at ? new Date(a.last_synced_at) : null,
              },
              now,
              staleHours,
            );
            return (
              <div
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {a.bank_name} ••{a.account_last4}
                    {a.is_active ? "" : " · switched off"}
                  </p>
                  <p className="text-sm text-muted">
                    {a.account_name} ·{" "}
                    {connected ? "Bank connection (automatic)" : "Statements you upload"}
                    {connected && a.last_synced_at
                      ? ` · last update ${timeAgo(new Date(a.last_synced_at), now)}`
                      : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {connected && a.is_active ? (
                    <StatusPill tone={state.tone}>
                      {state.stale ? "No recent update" : "Up to date"}
                    </StatusPill>
                  ) : null}
                  {!connected ? (
                    <Link href="/money/import" className="text-sm underline underline-offset-4">
                      Upload statement
                    </Link>
                  ) : null}
                  {isOwner ? (
                    <form action={setAccountActive}>
                      <input type="hidden" name="id" value={a.id} />
                      <input type="hidden" name="active" value={a.is_active ? "false" : "true"} />
                      <Button type="submit" variant="ghost" className="text-sm">
                        {a.is_active ? "Switch off" : "Switch on"}
                      </Button>
                    </form>
                  ) : null}
                </div>
              </div>
            );
          })}
        </Card>
      ) : (
        <EmptyState title="No bank accounts yet">
          {isOwner
            ? "Add the accounts the business uses. You can upload statements straight away; automatic updates need a bank connection."
            : "Ask the owner to add the business bank accounts."}
        </EmptyState>
      )}

      <Card className="flex flex-col gap-2">
        <h2 className="font-display text-xl">Automatic bank updates</h2>
        <p className="text-sm text-muted">
          Accounts set to &quot;bank connection&quot; update by themselves every hour once the bank
          service is switched on. Until then, upload statements and everything else works the same.
          We warn you here, on Home and in the sidebar if an account has not updated for{" "}
          {staleHours} hours.
        </p>
      </Card>

      {isOwner ? <AddAccountForm /> : null}
    </div>
  );
}
