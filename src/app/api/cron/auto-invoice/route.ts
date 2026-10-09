import { authorized } from "@/lib/cron";
import { takeMetricSnapshot } from "@/lib/metric-snapshots";
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

  // …and so does the metric snapshot (P8-T5): today's metrics, kept for their history.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(new Date());
  try {
    const metrics = await takeMetricSnapshot(db, today);
    return Response.json({ created, metrics });
  } catch (e) {
    return Response.json({ created, error: (e as Error).message }, { status: 500 });
  }
}
