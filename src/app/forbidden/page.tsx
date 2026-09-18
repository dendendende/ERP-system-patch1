import Link from "next/link";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "No access · Cashflow" };

export default function ForbiddenPage() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState
        title="Only the owner can open this page"
        action={
          <Link href="/" className="text-sm underline underline-offset-4">
            Back to Home
          </Link>
        }
      >
        Ask the owner if you need something changed here.
      </EmptyState>
    </main>
  );
}
