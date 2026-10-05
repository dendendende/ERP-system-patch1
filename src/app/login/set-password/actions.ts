"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SetPasswordState = { error?: string };

export async function setPassword(
  _prev: SetPasswordState,
  form: FormData,
): Promise<SetPasswordState> {
  const password = String(form.get("password") ?? "");
  if (password !== String(form.get("again") ?? ""))
    return { error: "The two passwords are different." };
  // Same rule as the auth server (supabase/config.toml), said in plain words before it refuses.
  if (
    password.length < 12 ||
    !/[a-z]/.test(password) ||
    !/[A-Z]/.test(password) ||
    !/\d/.test(password)
  ) {
    return { error: "Use at least 12 characters, with lower and upper case letters and a number." };
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "Couldn't save that password. Open the link from the owner again." };
  redirect("/login/enroll");
}
