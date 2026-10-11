// How a bulk action went, in one line: how many were done, and for the rest why not, grouped
// ("2 not: This customer has no email address"). The database says why for each row.

export type BulkRow = { id: string; error: string | null };

// the database's words, where a person would say it differently
const PLAIN: [RegExp, string][] = [
  [/does not match the direction/, "it went the other way (money in vs money out)"],
  [/already went out today/, "a reminder for it already went out today"],
  [/not waiting for money/, "it isn't waiting for money"],
  [/still waiting for money can be voided/, "it isn't waiting for money"],
];
const plain = (error: string) => PLAIN.find(([re]) => re.test(error))?.[1] ?? error;

export function bulkOutcome(rows: BulkRow[], done: (n: number) => string): string {
  const why = new Map<string, number>();
  for (const r of rows) if (r.error) why.set(plain(r.error), (why.get(plain(r.error)) ?? 0) + 1);
  const ok = rows.length - [...why.values()].reduce((a, b) => a + b, 0);
  return [
    ok ? done(ok) : "Nothing was changed.",
    ...[...why].map(
      ([reason, n]) => `${n.toLocaleString("id-ID")} not: ${reason.replace(/\.$/, "")}.`,
    ),
  ].join(" ");
}

/** Only well-formed ids reach the database, at most 1,000 (the database checks again). */
export const bulkIds = (ids: unknown) =>
  (Array.isArray(ids) ? ids : [])
    .filter((id): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id))
    .slice(0, 1000);
