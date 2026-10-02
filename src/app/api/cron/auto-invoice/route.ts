import { authorized } from "@/lib/cron";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Daily: invoices for subscriptions coming up for renewal. Running it more than once a day
// creates nothing extra.
export async function GET(request: Request) {
  if (!authorized(request)) return new Response("Unauthorized", { status: 401 });

  const db = createAdminClient();
  const { data: created, error } = await db.rpc("create_due_invoices", {});
  if (error) return Response.json({ error: error.message }, { status: 500 });

  // The daily health snapshot rides on the same daily run.
  const { error: healthError } = await db.rpc("take_health_snapshot", {});
  if (healthError) return Response.json({ created, error: healthError.message }, { status: 500 });
  return Response.json({ created });
}
