import Link from "next/link";
import { Card, EmptyState, Table, Td, Th, Tr } from "@/components/ui";
import { type ReportResult, alignRight, showCell } from "@/lib/reports";

/** A report's result: its table (totals last), and the notes on what it counts. */
export function ReportTable({ title, result }: { title: string; result: ReportResult }) {
  if (!result.rows.length) {
    return <EmptyState title="Nothing to report">Nothing matches these choices.</EmptyState>;
  }
  const [first, ...rest] = result.columns;
  return (
    <div className="flex flex-col gap-3">
      <Card className="p-0">
        <Table label={title}>
          <thead>
            <tr>
              {result.columns.map((c) => (
                <Th key={c.key} align={alignRight(c.kind) ? "right" : "left"}>
                  {c.label}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r, i) => (
              <Tr key={i} className={r.strong ? "font-medium" : undefined}>
                <Td>
                  {r.href ? (
                    <Link href={r.href} className="underline-offset-4 hover:underline">
                      {showCell(first.kind, r.cells[first.key])}
                    </Link>
                  ) : (
                    showCell(first.kind, r.cells[first.key])
                  )}
                </Td>
                {rest.map((c) => (
                  <Td key={c.key} align={alignRight(c.kind) ? "right" : "left"}>
                    {showCell(c.kind, r.cells[c.key])}
                  </Td>
                ))}
              </Tr>
            ))}
          </tbody>
          {result.totals ? (
            <tfoot>
              <tr className="font-medium">
                {result.columns.map((c) => (
                  <Td key={c.key} align={alignRight(c.kind) ? "right" : "left"}>
                    {result.totals![c.key] === undefined || result.totals![c.key] === null
                      ? ""
                      : showCell(c.kind, result.totals![c.key])}
                  </Td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </Table>
      </Card>
      {result.notes?.length ? (
        <ul className="flex flex-col gap-1 text-sm text-muted">
          {result.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
