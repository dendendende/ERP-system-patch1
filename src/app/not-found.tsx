import Link from "next/link";
import { EmptyState } from "@/components/ui";

export const metadata = { title: "Not found · Cashflow" };

export default function NotFound() {
  return (
    <main className="mx-auto max-w-lg px-4 py-16">
      <EmptyState title="We couldn't find that page">
        It may have moved, or the link is incomplete.{" "}
        <Link href="/" className="underline underline-offset-4">
          Go to Home
        </Link>
      </EmptyState>
    </main>
  );
}
