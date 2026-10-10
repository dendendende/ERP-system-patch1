import { notFound } from "next/navigation";
import { customerView } from "./customer";

export const metadata = { title: "Customer · Cashflow" };

export default async function CustomerPage({ params }: PageProps<"/customers/[id]">) {
  const customer = await customerView((await params).id, "page");
  if (!customer) notFound();
  return <div className="max-w-4xl">{customer.view}</div>;
}
