import { Card } from "@/components/ui";
import { describeDevice } from "@/lib/device";
import { createClient } from "@/lib/supabase/server";

const when = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Jakarta",
  dateStyle: "medium",
  timeStyle: "short",
});

const weekAgo = () => new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();

/** Owner only (the table's RLS returns nothing to anyone else): people who signed in from a
 * browser the app hadn't seen them use before, in the last 7 days. */
export async function NewDevices() {
  const supabase = await createClient();
  const { data } = await supabase
    .from("sign_in_devices")
    .select("id, user_agent, ip, first_seen, users (name)")
    .gte("first_seen", weekAgo())
    .order("first_seen", { ascending: false })
    .limit(10);
  if (!data?.length) return null;
  return (
    <Card className="flex flex-col gap-2">
      <h2 className="font-display text-xl">Signed in from a new device</h2>
      <p className="text-sm text-muted">
        Last 7 days. If one of these wasn&apos;t your team, switch that person off in Settings →
        Team and ask them to change their password.
      </p>
      <ul className="flex flex-col gap-1 text-sm">
        {data.map((d) => (
          <li key={d.id}>
            <span className="font-medium">{d.users?.name || "Someone"}</span> ·{" "}
            {describeDevice(d.user_agent)} · {when.format(new Date(d.first_seen))}
            {d.ip ? <span className="text-muted"> · {d.ip}</span> : null}
          </li>
        ))}
      </ul>
    </Card>
  );
}
