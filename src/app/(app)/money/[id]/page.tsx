import { notFound } from "next/navigation";
import { transactionView } from "./transaction";

export const metadata = { title: "Transaction · Cashflow" };

export default async function TransactionPage({ params }: PageProps<"/money/[id]">) {
  const t = await transactionView((await params).id, "page");
  if (!t) notFound();
  return <div className="max-w-3xl">{t.view}</div>;
}
