import Link from "next/link";
import { PageStub } from "@/components/page-stub";

export const metadata = { title: "Money in & out · Cashflow" };

export default function MoneyPage() {
  return (
    <PageStub title="Money in & out">
      Every transfer from your bank accounts will be listed here, sorted into what it was for.{" "}
      <Link href="/money/import" className="underline underline-offset-4">
        Import a bank statement
      </Link>
    </PageStub>
  );
}
