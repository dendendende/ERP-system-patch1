/** What a bill's status is called on screen, and its colour. */
export const INVOICE_STATUS: Record<
  string,
  { label: string; tone: "neutral" | "in" | "attention" }
> = {
  open: { label: "Waiting", tone: "attention" },
  partly_paid: { label: "Partly paid", tone: "attention" },
  paid: { label: "Paid", tone: "in" },
  void: { label: "Cancelled", tone: "neutral" },
};
