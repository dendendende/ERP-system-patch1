import "server-only";
import { createClient } from "@/lib/supabase/server";
import { setupProgress } from "./setup";

/** The setup guide's progress, read with the signed-in person's own rights. */
export async function loadSetupProgress() {
  const supabase = await createClient();
  const count = (q: PromiseLike<{ count: number | null }>) => q.then((r) => r.count ?? 0);
  const [
    bankAccounts,
    transactions,
    needsLabel,
    labelledByPeople,
    activeSubscriptions,
    regularCosts,
    teamMembers,
    marked,
  ] = await Promise.all([
    count(
      supabase
        .from("bank_accounts")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ),
    count(supabase.from("bank_transactions").select("id", { count: "exact", head: true })),
    count(
      supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "needs_label"),
    ),
    count(
      supabase
        .from("entries")
        .select("id", { count: "exact", head: true })
        .eq("status", "labelled"),
    ),
    count(
      supabase
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("status", "active"),
    ),
    count(
      supabase
        .from("recurring_expenses")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
    ),
    count(
      supabase.from("users").select("id", { count: "exact", head: true }).eq("is_active", true),
    ),
    supabase.from("setup_steps").select("step"),
  ]);
  return setupProgress(
    {
      bankAccounts,
      transactions,
      needsLabel,
      labelledByPeople,
      activeSubscriptions,
      regularCosts,
      teamMembers,
    },
    new Set((marked.data ?? []).map((m) => m.step)),
  );
}
