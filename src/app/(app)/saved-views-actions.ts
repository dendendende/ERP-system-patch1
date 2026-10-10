"use server";

import { revalidatePath } from "next/cache";
import { billViewQuery, readBillFilters } from "@/lib/bill-filters";
import { customerViewQuery, readCustomerFilters } from "@/lib/customer-filters";
import { readMoneyFilters, viewQuery } from "@/lib/money-filters";
import { findReport } from "@/lib/report-library";
import { readParams, reportQuery } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

// Saved views (P7-T3). The stored query is always rebuilt from the list's own checked filters,
// never taken as typed — and the database refuses anything but plain filter characters.
const LISTS = {
  money: {
    base: "/money",
    normalize: (query: string) =>
      viewQuery(readMoneyFilters(Object.fromEntries(new URLSearchParams(query)))),
  },
  customers: {
    base: "/customers",
    normalize: (query: string) =>
      customerViewQuery(readCustomerFilters(Object.fromEntries(new URLSearchParams(query)))),
  },
  invoices: {
    base: "/customers/bills",
    normalize: (query: string) =>
      billViewQuery(readBillFilters(Object.fromEntries(new URLSearchParams(query)))),
  },
  // a favourite report: the report and its parameters, each checked ("" for an unknown report)
  reports: {
    base: "/reports",
    normalize: (query: string) => {
      const q = Object.fromEntries(new URLSearchParams(query));
      const report = findReport(q.report ?? "");
      const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(
        new Date(),
      );
      return report ? reportQuery(report, readParams(report, q, today)) : "";
    },
  },
} as const;
type ListName = keyof typeof LISTS;

const ROLE_WORDS = { owner: "owners", operator: "operators", viewer: "viewers" } as const;
type Role = keyof typeof ROLE_WORDS;

export type SaveViewState = { error?: string; saved?: string };

export async function saveView(_prev: SaveViewState, form: FormData): Promise<SaveViewState> {
  const list = String(form.get("list")) as ListName;
  if (!(list in LISTS)) return { error: "This list can't save views." };
  const name = String(form.get("name") ?? "").trim();
  if (!name) return { error: "Give the view a name, for example Needs a label." };
  if (name.length > 60) return { error: "Keep the name under 60 characters." };
  const role = String(form.get("default_for_role") ?? "");
  const defaultForRole = role in ROLE_WORDS ? (role as Role) : null;

  const query = LISTS[list].normalize(String(form.get("query") ?? ""));
  if (list === "reports" && !query) return { error: "That report doesn't exist." };

  const supabase = await createClient();
  const { error } = await supabase.from("saved_views").insert({
    list,
    name,
    query,
    default_for_role: defaultForRole,
  });
  if (error) {
    if (error.code === "23505") {
      return {
        error: error.message.includes("role_default")
          ? `There is already a starting view for ${ROLE_WORDS[defaultForRole!]}. Remove that one first.`
          : "You already have a view with that name.",
      };
    }
    return {
      error: error.message.includes("row-level security")
        ? "Only the owner can choose a starting view for others."
        : "Couldn't save the view. Try again.",
    };
  }
  revalidatePath(LISTS[list].base);
  return { saved: name };
}

export async function deleteView(form: FormData) {
  const list = String(form.get("list")) as ListName;
  const supabase = await createClient();
  // RLS: your own views; the owner also any role's starting view
  await supabase
    .from("saved_views")
    .delete()
    .eq("id", String(form.get("id") ?? ""));
  if (list in LISTS) revalidatePath(LISTS[list].base);
}
