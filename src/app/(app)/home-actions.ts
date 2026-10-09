"use server";

import { revalidatePath } from "next/cache";
import { arrange, rearrange } from "@/lib/home-cues";
import { createClient } from "@/lib/supabase/server";

/** Arranging Home's cues (P8-T6b): one step per click — move, hide, show, or back to the start. */
export async function arrangeHome(form: FormData) {
  const step = String(form.get("step") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // RLS: only your own row
  let error;
  if (step === "reset") {
    ({ error } = await supabase.from("home_layouts").delete().eq("user_id", user.id));
  } else {
    const [me, saved] = await Promise.all([
      supabase.from("users").select("role").eq("id", user.id).maybeSingle(),
      supabase.from("home_layouts").select("cues").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!me.data) return;
    const { shown } = arrange(me.data.role, saved.data?.cues ?? null);
    // no user_id: it defaults to the person signed in, and an upsert may only change these two
    ({ error } = await supabase
      .from("home_layouts")
      .upsert(
        { cues: rearrange(shown, step), updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      ));
  }
  if (error) throw new Error("Couldn't save how Home is arranged. Try again.");
  revalidatePath("/");
}
