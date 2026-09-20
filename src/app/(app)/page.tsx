import Link from "next/link";
import { PageStub } from "@/components/page-stub";
import { Card } from "@/components/ui";
import { currentSyncState } from "@/lib/bank/current-sync";
import { staleAfterHours } from "@/lib/bank/sync-status";

export const metadata = { title: "Home · Cashflow" };

export default async function HomePage() {
  const sync = await currentSyncState();
  return (
    <div className="flex flex-col gap-6">
      {sync.stale ? (
        <Card className="flex flex-col gap-1 border-attention/40 bg-attention-bg/40">
          <p className="font-medium text-attention-ink">{sync.message}</p>
          <p className="text-sm text-attention-ink/80">
            Money that came in during the last {staleAfterHours()} hours may be missing.{" "}
            <Link href="/settings/bank" className="underline underline-offset-4">
              Check bank connections
            </Link>
          </p>
        </Card>
      ) : null}

      <PageStub title="Home">
        Your money at a glance — what came in, what went out, and who still owes you — will show
        here once the bank is connected.
      </PageStub>
    </div>
  );
}
