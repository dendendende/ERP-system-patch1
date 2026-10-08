"use server";

import { revalidatePath } from "next/cache";
import { SETUP_STEPS } from "@/lib/setup";
import { createClient } from "@/lib/supabase/server";

/** The owner marks a step done or skips it. Saved, so the guide resumes from the next one. */
export async function markStep(form: FormData) {
  const step = String(form.get("step") ?? "");
  if (!SETUP_STEPS.some((s) => s.id === step)) return;
  const supabase = await createClient();
  await supabase
    .from("setup_steps")
    .upsert({ step }, { onConflict: "step", ignoreDuplicates: true });
  revalidatePath("/setup");
  revalidatePath("/");
}
