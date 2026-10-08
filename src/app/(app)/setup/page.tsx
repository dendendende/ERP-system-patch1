import Link from "next/link";
import { Button, Card, StatusPill } from "@/components/ui";
import { loadSetupProgress } from "@/lib/setup-data";
import { markStep } from "./actions";

export const metadata = { title: "Getting started · Cashflow" };

export default async function SetupPage() {
  const { steps, doneCount, total, next } = await loadSetupProgress();

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="font-display text-3xl md:text-4xl">Getting started</h1>
        <p className="text-muted">
          Seven steps, about half an hour. Do them in any order and stop whenever you like — the app
          remembers where you were.
        </p>
        <div
          className="h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-label="Setup progress"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
        >
          <div
            className="h-full rounded-full bg-in transition-[width] duration-200 ease-out"
            style={{ width: `${(doneCount / total) * 100}%` }}
          />
        </div>
        <p className="text-sm text-muted tabular-nums">
          {doneCount} of {total} done
        </p>
      </div>

      {next ? null : (
        <Card className="flex flex-col gap-1 border-in/40 bg-in/10">
          <p className="font-medium">All set. The app now keeps itself up to date.</p>
          <p className="text-sm text-muted">
            <Link href="/" className="underline underline-offset-4">
              Go to Home
            </Link>
          </p>
        </Card>
      )}

      <ol className="flex flex-col gap-3">
        {steps.map((s, i) => {
          const isNext = s.id === next?.id;
          return (
            <li key={s.id}>
              <Card className={`flex flex-col gap-3 ${isNext ? "border-ink/30" : ""}`}>
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-display text-xl">
                    <span className="text-muted tabular-nums">{i + 1}.</span> {s.title}
                  </h2>
                  {s.done ? (
                    <StatusPill tone="in">Done</StatusPill>
                  ) : isNext ? (
                    <StatusPill tone="attention">Next</StatusPill>
                  ) : null}
                </div>
                {s.done ? null : (
                  <>
                    <p className="text-sm text-muted">{s.why}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href={s.href}
                        className="inline-flex h-10 items-center rounded-lg bg-brand px-4 text-sm font-medium text-surface transition-colors hover:bg-brand-deep"
                      >
                        Open
                      </Link>
                      <form action={markStep}>
                        <input type="hidden" name="step" value={s.id} />
                        <Button type="submit" variant="secondary">
                          {s.markLabel}
                        </Button>
                      </form>
                    </div>
                  </>
                )}
              </Card>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
