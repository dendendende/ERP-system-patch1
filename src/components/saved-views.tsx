import Link from "next/link";
import { deleteView } from "@/app/(app)/saved-views-actions";
import { createClient } from "@/lib/supabase/server";
import { SaveViewForm } from "./save-view-form";

const ROLE_WORDS = { owner: "owners", operator: "operators", viewer: "viewers" } as const;

/** The saved views of one list: one click to open, × to remove, and "Save this view". */
export async function SavedViews({
  list,
  base,
  query,
}: {
  list: "money";
  base: string;
  /** The current filters, as a saved view would store them. */
  query: string;
}) {
  const supabase = await createClient();
  const [{ data: views }, { data: role }, { data: auth }] = await Promise.all([
    supabase
      .from("saved_views")
      .select("id, name, query, user_id, default_for_role")
      .eq("list", list)
      .order("name"),
    supabase.rpc("current_app_role"),
    supabase.auth.getUser(),
  ]);
  const me = auth.user?.id;
  const isOwner = role === "owner";

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-muted">Views:</span>
      <Link
        href={`${base}?all=1`}
        aria-current={query === "" ? "page" : undefined}
        className="rounded-full border border-line px-2.5 py-0.5 transition-colors hover:border-ink/40 aria-[current=page]:border-brand aria-[current=page]:bg-brand aria-[current=page]:text-surface"
      >
        Everything
      </Link>
      {(views ?? []).map((v) => {
        const current = v.query === query;
        const canRemove = v.user_id === me || (isOwner && v.default_for_role !== null);
        return (
          <span
            key={v.id}
            className={`inline-flex items-center rounded-full border transition-colors ${current ? "border-brand bg-brand text-surface" : "border-line hover:border-ink/40"}`}
          >
            <Link
              href={`${base}?${v.query || "all=1"}`}
              aria-current={current ? "page" : undefined}
              className="py-0.5 pr-1 pl-2.5"
            >
              {v.name}
              {v.default_for_role ? (
                <span className={current ? "text-surface/80" : "text-muted"}>
                  {" "}
                  · starting view for {ROLE_WORDS[v.default_for_role]}
                </span>
              ) : null}
            </Link>
            {canRemove ? (
              <form action={deleteView}>
                <input type="hidden" name="id" value={v.id} />
                <input type="hidden" name="list" value={list} />
                <button
                  type="submit"
                  aria-label={`Remove the view ${v.name}`}
                  className="rounded-full px-1.5 py-0.5 opacity-70 hover:opacity-100"
                >
                  ×
                </button>
              </form>
            ) : (
              <span className="pr-1.5" />
            )}
          </span>
        );
      })}
      <SaveViewForm list={list} query={query} isOwner={isOwner} />
    </div>
  );
}
