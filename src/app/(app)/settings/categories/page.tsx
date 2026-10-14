import Link from "next/link";
import { ActionForm } from "@/components/action-form";
import { Button, Card, EmptyState, StatusPill } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";
import { deleteCategory, updateRule } from "./actions";
import { AddCategoryForm } from "./add-category-form";

export const metadata = { title: "Categories & rules · Cashflow" };

const MATCH_WORDS: Record<string, string> = {
  contains: "contains",
  equals: "is exactly",
  regex: "matches the pattern",
};

export default async function CategoriesAndRulesPage() {
  const supabase = await createClient();
  const [{ data: rules, error: rulesError }, { data: categories }] = await Promise.all([
    supabase
      .from("rules")
      .select(
        // entries!entries_rule_id_fkey: rules and entries point at each other, so name the link
        "id, match_type, pattern, direction, priority, is_active, category_id, categories (name), entries!entries_rule_id_fkey (count)",
      )
      .order("is_active", { ascending: false })
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase
      .from("categories")
      .select("id, name, type, is_system, entries!entries_category_id_fkey (count)")
      .order("type")
      .order("name"),
  ]);

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="font-display text-3xl md:text-4xl">Categories &amp; rules</h1>
        <p className="text-sm text-muted">
          Rules label new transactions by themselves. Switching one off leaves everything it already
          labelled exactly as it is.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Rules</h2>
        {rulesError ? (
          <p className="text-sm text-problem">Couldn&apos;t load the rules. Try again.</p>
        ) : rules?.length ? (
          <Card className="p-0">
            <ul aria-label="Rules">
              {rules.map((rule) => {
                const used = rule.entries?.[0]?.count ?? 0;
                return (
                  <li
                    key={rule.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4 last:border-b-0"
                  >
                    <div className="min-w-0">
                      {/* switched off: muted (the pill says Off), never faded — still readable */}
                      <p className={`font-medium ${rule.is_active ? "" : "text-muted"}`}>
                        {rule.direction === "in" ? "Money in" : "Money out"}{" "}
                        {MATCH_WORDS[rule.match_type]} &ldquo;{rule.pattern}&rdquo;
                      </p>
                      <p className="text-sm text-muted">
                        files it under {rule.categories?.name} ·{" "}
                        <span className="tabular-nums">{used}</span>{" "}
                        {used === 1 ? "transaction" : "transactions"} labelled
                        {rule.priority ? ` · priority ${rule.priority}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {rule.is_active ? (
                        <StatusPill tone="in">On</StatusPill>
                      ) : (
                        <StatusPill>Off</StatusPill>
                      )}
                      <ActionForm action={updateRule}>
                        <input type="hidden" name="id" value={rule.id} />
                        <input
                          type="hidden"
                          name="is_active"
                          value={rule.is_active ? "false" : "true"}
                        />
                        <Button type="submit" variant="ghost" className="text-sm">
                          {rule.is_active ? "Switch off" : "Switch on"}
                        </Button>
                      </ActionForm>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        ) : (
          <EmptyState title="No rules yet">
            Rules are made where the work happens: label something in{" "}
            <Link href="/money" className="underline underline-offset-4">
              Money in &amp; out
            </Link>{" "}
            and tick &ldquo;label this payee this way from now on&rdquo;.
          </EmptyState>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="font-display text-xl">Categories</h2>
        <Card className="p-0">
          <ul aria-label="Categories">
            {categories?.map((c) => {
              const used = c.entries?.[0]?.count ?? 0;
              return (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3 last:border-b-0"
                >
                  <div>
                    <p className="font-medium">{c.name}</p>
                    <p className="text-sm text-muted">
                      {c.type === "in" ? "Money in" : "Money out"} ·{" "}
                      <span className="tabular-nums">{used}</span> used
                    </p>
                  </div>
                  {c.is_system ? (
                    <StatusPill>Built in</StatusPill>
                  ) : used === 0 ? (
                    <ActionForm action={deleteCategory}>
                      <input type="hidden" name="id" value={c.id} />
                      <Button type="submit" variant="ghost" className="text-sm">
                        Remove
                      </Button>
                    </ActionForm>
                  ) : (
                    <StatusPill>Yours</StatusPill>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <AddCategoryForm />
    </div>
  );
}
