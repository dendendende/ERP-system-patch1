import Link from "next/link";
import { Card } from "@/components/ui";
import { loadSetupProgress } from "@/lib/setup-data";

/** On the owner's Home until the setup guide is finished. */
export async function SetupCard() {
  const { doneCount, total, next } = await loadSetupProgress();
  if (!next) return null;
  return (
    <Card className="flex flex-col gap-1">
      <p className="font-medium">
        Getting started:{" "}
        <span className="tabular-nums">
          {doneCount} of {total}
        </span>{" "}
        done
      </p>
      <p className="text-sm text-muted">
        Next: {next.title}.{" "}
        <Link href="/setup" className="text-ink underline underline-offset-4">
          Continue setting up
        </Link>
      </p>
    </Card>
  );
}
