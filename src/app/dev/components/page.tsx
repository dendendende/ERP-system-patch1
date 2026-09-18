import type { ReactNode } from "react";
import { Button, Card, Checkbox, EmptyState, Input, StatusPill, TableRow } from "@/components/ui";
import { formatRupiah, formatRupiahShort } from "@/lib/money";

export const metadata = { title: "Components · Cashflow" };

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </section>
  );
}

const swatches = [
  ["ground", "bg-ground"],
  ["surface", "bg-surface"],
  ["ink", "bg-ink"],
  ["muted", "bg-muted"],
  ["line", "bg-line"],
  ["in", "bg-in"],
  ["attention", "bg-attention"],
  ["attention-bg", "bg-attention-bg"],
  ["problem", "bg-problem"],
] as const;

export default function ComponentsPage() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-10 px-4 py-10">
      <header>
        <p className="text-sm text-muted">Came in this month</p>
        <p className="font-display text-5xl tabular-nums">{formatRupiah(128_450_000n)}</p>
        <p className="text-sm text-muted tabular-nums">
          Short form: {formatRupiahShort(128_450_000n)} · {formatRupiahShort(2_650_000_000n)}
        </p>
      </header>

      <Section title="Colours">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {swatches.map(([name, bg]) => (
            <div key={name} className="flex flex-col gap-1">
              <div className={`h-10 rounded-lg border border-line ${bg}`} />
              <span className="text-xs text-muted">{name}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Buttons">
        <div className="flex flex-wrap gap-2">
          <Button>Save</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Remove</Button>
          <Button disabled>Disabled</Button>
        </div>
      </Section>

      <Section title="Status pills">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone="in">Paid</StatusPill>
          <StatusPill tone="attention">Due today</StatusPill>
          <StatusPill tone="problem">Overdue</StatusPill>
          <StatusPill>Draft</StatusPill>
        </div>
      </Section>

      <Section title="Inputs">
        <Card className="flex flex-col gap-4">
          <Input label="Customer name" name="name" placeholder="PT Maju Jaya" />
          <Input label="Amount" name="amount" hint="In rupiah, no dots needed" />
          <Input label="Email" name="email" defaultValue="not-an-email" error="Check this email" />
          <Checkbox label="Label this payee this way from now on" />
        </Card>
      </Section>

      <Section title="Table rows">
        <Card className="p-0">
          <TableRow
            primary="PT Maju Jaya"
            secondary="Transfer · 12 Sep"
            meta={<StatusPill tone="in">Matched</StatusPill>}
            amount={<span className="text-in">+{formatRupiah(12_000_284n)}</span>}
          />
          <TableRow
            primary="AWS"
            secondary="Servers & hosting · 10 Sep"
            amount={formatRupiah(-3_450_000n)}
          />
          <TableRow
            primary="TRSF E-BANKING 0912/FTSCY/WS95051"
            secondary="No category yet"
            meta={<StatusPill tone="attention">Needs label</StatusPill>}
            amount={<span className="text-in">+{formatRupiah(500_000n)}</span>}
          />
        </Card>
      </Section>

      <Section title="Empty state">
        <EmptyState
          title="Nothing needs a label"
          action={<Button variant="secondary">See all money in &amp; out</Button>}
        >
          Every transaction from the bank has a category. New ones will show up here.
        </EmptyState>
      </Section>
    </main>
  );
}
