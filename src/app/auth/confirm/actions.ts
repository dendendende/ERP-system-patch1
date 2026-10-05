"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export async function confirmLink(form: FormData) {
  const tokenHash = String(form.get("token_hash") ?? "");
  // Only the two kinds of link the team screen makes.
  const type = form.get("type") === "recovery" ? "recovery" : "invite";
  const limit = rateLimit({ [`confirm:ip:${clientIp(await headers())}`]: 10 });
  if (await limit.blocked()) redirect("/login?reason=too-many");
  const supabase = await createClient();
  await supabase.auth.signOut(); // whoever was signed in on this browser, it's the invitee now
  const { error } = tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    : { error: true };
  if (error) {
    await limit.failed();
    redirect("/login?reason=link");
  }
  redirect("/login/set-password");
}
