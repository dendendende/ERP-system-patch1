import Link from "next/link";
import { Card } from "@/components/ui";
import { type CueId, cueInfo } from "@/lib/home-cues";
import { arrangeHome } from "./home-actions";

const step =
  "rounded-md border border-line px-2 py-1 text-sm transition-colors hover:border-brand/40 hover:text-brand disabled:opacity-30 disabled:hover:border-line disabled:hover:text-inherit";

/** Choose which cues Home shows and in what order (P8-T6b). Each click saves straight away. */
export function ArrangeCues({ shown, hidden }: { shown: CueId[]; hidden: CueId[] }) {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-xl">Arrange your numbers</h2>
        <Link href="/" className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white">
          Done
        </Link>
      </div>
      <form action={arrangeHome} className="grid gap-6 md:grid-cols-2">
        <section aria-label="Shown on Home" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">Shown, in this order</h3>
          {shown.length ? null : (
            <p className="text-sm text-muted">Nothing — add some from the right.</p>
          )}
          <ol className="flex flex-col gap-1">
            {shown.map((id, i) => {
              const { label } = cueInfo(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-ground"
                >
                  <span className="flex-1 truncate text-sm">{label}</span>
                  <button
                    name="step"
                    value={`up:${id}`}
                    disabled={i === 0}
                    aria-label={`Move ${label} up`}
                    className={step}
                  >
                    ↑
                  </button>
                  <button
                    name="step"
                    value={`down:${id}`}
                    disabled={i === shown.length - 1}
                    aria-label={`Move ${label} down`}
                    className={step}
                  >
                    ↓
                  </button>
                  <button
                    name="step"
                    value={`hide:${id}`}
                    aria-label={`Hide ${label}`}
                    className={step}
                  >
                    Hide
                  </button>
                </li>
              );
            })}
          </ol>
        </section>
        <section aria-label="Hidden" className="flex flex-col gap-2">
          <h3 className="text-sm font-medium text-muted">Hidden</h3>
          {hidden.length ? null : <p className="text-sm text-muted">Nothing hidden.</p>}
          <ul className="flex flex-col gap-1">
            {hidden.map((id) => {
              const { label } = cueInfo(id);
              return (
                <li
                  key={id}
                  className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-ground"
                >
                  <span className="flex-1 truncate text-sm text-muted">{label}</span>
                  <button
                    name="step"
                    value={`show:${id}`}
                    aria-label={`Show ${label}`}
                    className={step}
                  >
                    Show
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            name="step"
            value="reset"
            className="mt-2 self-start text-sm text-muted underline underline-offset-4 hover:text-brand"
          >
            Back to the starting set
          </button>
        </section>
      </form>
    </Card>
  );
}
