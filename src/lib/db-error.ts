// What to tell a person when the database says no. Our own checks raise plain sentences
// (check_violation, or a bare raise); anything else is Postgres's wording, so say it plainly.

export const NOT_SAVED = "That didn't save. Reload the page and try again.";

export function plainError(error: { code?: string; message: string }): string {
  return error.code === "23514" || error.code === "P0001" ? error.message : NOT_SAVED;
}

/** A write that found no row it may change (RLS filters it out without an error). */
export const NOT_YOURS =
  "That didn't save: it may have changed, or you may not be allowed to. Reload the page.";

/** A write's answer (`.select("id")` on it) as a form's: nothing when it saved. */
export function answer(r: {
  error: { code?: string; message: string } | null;
  data: unknown[] | null;
}): { error?: string } {
  if (r.error) return { error: plainError(r.error) };
  return r.data?.length ? {} : { error: NOT_YOURS };
}
