import Link from "next/link";
import type { ReactNode } from "react";
import { SectionNav } from "./section-nav";
import { Card } from "./ui";

// The object floorplan (P7-T7, UPGRADE-v2 §3.4): one shape for a transaction, a customer, a bill.
//   header: what it is, its status, 4–6 key facts, the main actions
//   then sections (Overview, Bills, Payments, History…), with a sticky nav to jump between them.
// "panel" mode is the same object squeezed into a list's side panel (P7-T6): the panel already
// shows the title, facts go two to a row, and there is no jump nav — the panel is short enough.

export type Fact = { label: string; value: ReactNode };

export type ObjectSection = {
  id: string;
  title: string;
  /** Shorter name for the jump nav, e.g. "History" for "Change history". */
  short?: string;
  /** A line under the title: what this section is for. */
  description?: ReactNode;
  content: ReactNode;
  /** Content brings its own cards (e.g. a list of cards): don't wrap it in one. */
  bare?: boolean;
};

export function ObjectPage({
  mode = "page",
  back,
  eyebrow,
  title,
  headline,
  status,
  facts = [],
  actions,
  sections,
}: {
  mode?: "page" | "panel";
  back?: { href: string; label: string };
  /** Small line above the title, e.g. the date. */
  eyebrow?: ReactNode;
  title: string;
  /** The one big thing under the title, e.g. the amount. */
  headline?: ReactNode;
  /** Status pills. */
  status?: ReactNode;
  facts?: Fact[];
  actions?: ReactNode;
  sections: ObjectSection[];
}) {
  const panel = mode === "panel";
  // ids stay unique when the same kind of object is also open in a panel on the page
  const sectionId = (id: string) => (panel ? `panel-${id}` : id);
  const Heading = panel ? "h3" : "h2";

  return (
    <div className="flex flex-col gap-6">
      {back && !panel ? (
        <Link href={back.href} className="text-sm text-muted underline underline-offset-4">
          ← {back.label}
        </Link>
      ) : null}

      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow ? <p className="text-sm text-muted">{eyebrow}</p> : null}
            {panel ? null : (
              <h1 className="font-display text-3xl break-words md:text-4xl">{title}</h1>
            )}
            {headline}
            {status ? <div className="mt-1 flex flex-wrap gap-2">{status}</div> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
        {facts.length ? (
          <dl
            className={`grid gap-x-6 gap-y-3 rounded-xl border border-line bg-surface p-4 text-sm ${panel ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(9rem,1fr))]"}`}
          >
            {facts.map((f) => (
              <div key={f.label} className="min-w-0">
                <dt className="text-xs text-muted">{f.label}</dt>
                <dd className="truncate font-medium tabular-nums">{f.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </header>

      {!panel && sections.length > 2 ? (
        <SectionNav sections={sections.map((s) => ({ id: s.id, label: s.short ?? s.title }))} />
      ) : null}

      {sections.map((s) => (
        <section
          key={s.id}
          id={sectionId(s.id)}
          aria-labelledby={`${sectionId(s.id)}-title`}
          className="flex scroll-mt-16 flex-col gap-3"
        >
          <div className="flex flex-col gap-0.5">
            <Heading
              id={`${sectionId(s.id)}-title`}
              className={`font-display ${panel ? "text-lg" : "text-xl"}`}
            >
              {s.title}
            </Heading>
            {s.description ? <p className="text-sm text-muted">{s.description}</p> : null}
          </div>
          {s.bare ? s.content : <Card className="flex flex-col gap-4">{s.content}</Card>}
        </section>
      ))}
    </div>
  );
}
