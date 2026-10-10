import { notFound } from "next/navigation";
import { billView } from "./bill";

export const metadata = { title: "Bill · Cashflow" };

export default async function BillPage({ params }: PageProps<"/customers/[id]/bills/[invoiceId]">) {
  const { id, invoiceId } = await params;
  const bill = await billView(invoiceId, "page");
  // the address must name the bill's own customer
  if (!bill || bill.customerId !== id) notFound();
  return <div className="max-w-3xl">{bill.view}</div>;
}
