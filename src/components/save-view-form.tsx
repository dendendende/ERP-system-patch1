"use client";

import { useEffect, useRef } from "react";
import { type SaveViewState, saveView } from "@/app/(app)/saved-views-actions";
import { Button } from "@/components/ui";
import { useFormAction } from "@/components/use-form-action";

export function SaveViewForm({
  list,
  query,
  isOwner,
  summary = "+ Save this view",
  placeholder = "Needs a label",
  roleDefaults = true,
}: {
  list: string;
  query: string;
  isOwner: boolean;
  summary?: string;
  placeholder?: string;
  /** Offer "also the starting view for…" (the owner, on lists). */
  roleDefaults?: boolean;
}) {
  const [state, action, pending] = useFormAction<SaveViewState>(saveView, {});
  const details = useRef<HTMLDetailsElement>(null);
  // saved: close the panel; the new view is now in the row of views
  useEffect(() => {
    if (state.saved && details.current) details.current.open = false;
  }, [state]);
  return (
    <details ref={details} className="relative">
      <summary className="cursor-pointer list-none rounded-full border border-dashed border-line px-2.5 py-0.5 text-muted transition-colors hover:border-ink/40 hover:text-ink">
        {summary}
      </summary>
      <form
        onSubmit={action}
        className="absolute z-20 mt-2 flex w-72 flex-col gap-2 rounded-xl border border-line bg-surface p-3 text-sm shadow-sm"
      >
        <input type="hidden" name="list" value={list} />
        <input type="hidden" name="query" value={query} />
        <label className="flex flex-col gap-1 text-xs font-medium text-muted">
          Name
          <input
            name="name"
            required
            maxLength={60}
            placeholder={placeholder}
            className="h-9 rounded-lg border border-line px-2.5 text-sm text-ink"
          />
        </label>
        {isOwner && roleDefaults ? (
          <label className="flex flex-col gap-1 text-xs font-medium text-muted">
            Also the starting view for
            <select
              name="default_for_role"
              defaultValue=""
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-sm text-ink"
            >
              <option value="">Nobody else (just mine)</option>
              <option value="operator">Operators</option>
              <option value="viewer">Viewers</option>
              <option value="owner">Owners</option>
            </select>
          </label>
        ) : null}
        {state.error ? <p className="text-xs text-problem">{state.error}</p> : null}
        <Button type="submit" disabled={pending} className="h-9">
          {pending ? "Saving…" : "Save"}
        </Button>
      </form>
    </details>
  );
}
