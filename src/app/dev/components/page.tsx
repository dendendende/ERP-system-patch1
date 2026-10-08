import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  Button,
  Card,
  Checkbox,
  EmptyState,
  Input,
  Money,
  Skeleton,
  StatusPill,
  Table,
  TableRow,
  Td,
  Th,
  Tr,
} from "@/components/ui";
import { Cue, CueGrid, CueSkeleton } from "@/components/cue";
import { HEALTH_TONE } from "@/lib/health-status";
import { trend } from "@/lib/trend";
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
  ["brand", "bg-brand"],
  ["brand-deep", "bg-brand-deep"],
  ["brand-soft", "bg-brand-soft"],
  ["nav", "bg-nav"],
  ["in", "bg-in"],
  ["attention", "bg-attention"],
  ["attention-bg", "bg-attention-bg"],
  ["problem", "bg-problem"],
] as const;

export default function ComponentsPage() {
  // design showcase for development; not part of the live app
  if (process.env.VERCEL_ENV === "production") notFound();
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

      <Section title="Cues: every number opens its list (wide for rupiah, normal for counts)">
        <CueGrid label="Example cues">
          <Cue
            wide
            label="Came in this month"
            value={128_450_000n}
            unit="rupiah"
            href="/money?dir=in"
            trend={{ ...trend(128_450_000n, 111_700_000n, "up"), against: "vs last month" }}
            spark={[90, 104, 98, 121, 111, 128]}
          />
          <Cue
            wide
            label="Went out this month"
            value={46_200_000n}
            unit="rupiah"
            href="/money?dir=out"
            trend={{ ...trend(46_200_000n, 38_500_000n, "down"), against: "vs last month" }}
            spark={[40, 42, 39, 44, 38, 46]}
          />
          <Cue
            label="Paying late"
            value={3}
            unit="customers"
            href="/customers?show=late"
            status="danger"
            trend={{ ...trend(3, 1, "down"), against: "vs last week" }}
          />
          <Cue label="Cash lasts" value={7.5} unit="months" href="/health" status="warning" />
          <Cue
            label="Still owed"
            value={20_875_000n}
            unit="rupiah"
            href="/customers"
            status="healthy"
            caption="nothing past due"
          />
          <CueSkeleton />
        </CueGrid>
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

      <Section title="Health status colours (from the owner's limits)">
        <div className="flex flex-wrap gap-2">
          <StatusPill tone={HEALTH_TONE.healthy}>Healthy</StatusPill>
          <StatusPill tone={HEALTH_TONE.warning}>Keep an eye on it</StatusPill>
          <StatusPill tone={HEALTH_TONE.danger}>Needs attention</StatusPill>
        </div>
      </Section>

      <Section title="Dense table (v2): 40px rows, 13px, amounts right-aligned">
        <Card className="p-0">
          <Table label="Example transactions">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Description</Th>
                <Th>Category</Th>
                <Th align="right">Amount</Th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ["12 Sep", "PT Maju Jaya", "Subscription income", 12_000_284n, "in"],
                  ["10 Sep", "AWS", "Servers & hosting", 3_450_000n, "out"],
                  ["9 Sep", "Office rent", "Rent", 15_000_000n, "out"],
                  ["8 Sep", "CV Sinar Abadi", "Subscription income", 1_500_117n, "in"],
                ] as const
              ).map(([date, who, category, amount, direction]) => (
                <Tr key={who}>
                  <Td className="text-muted">{date}</Td>
                  <Td className="font-medium">{who}</Td>
                  <Td>{category}</Td>
                  <Td align="right">
                    <Money amount={amount} direction={direction} />
                  </Td>
                </Tr>
              ))}
              <tr>
                <Td className="font-medium" colSpan={3}>
                  Total
                </Td>
                <Td align="right" className="font-medium">
                  <Money amount={12_000_284n + 1_500_117n - 3_450_000n - 15_000_000n} />
                </Td>
              </tr>
            </tbody>
          </Table>
        </Card>
      </Section>

      <Section title="Loading placeholders">
        <Card className="flex flex-col gap-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-24" />
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
