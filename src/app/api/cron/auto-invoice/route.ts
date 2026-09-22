import { authorized } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Daily: invoices for subscriptions coming up for renewal. Running it more than once a day
// creates nothing extra.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const { data: created, error } = await createAdminClient().rpc("create_due_invoices", {});
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ created });
}
