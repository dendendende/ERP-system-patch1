"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { TOO_MANY, clientIp, rateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { error?: string };

export async function signIn(_prev: LoginState, form: FormData): Promise<LoginState> {
  const email = String(form.get("email") ?? "").trim();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password." };

  // Guessing: 20 wrong passwords per address, or 10 per email, every 15 minutes. (Supabase's own
  // limit sees only this server's address, so it can't tell visitors apart.)
  const limit = rateLimit({
    [`login:ip:${clientIp(await headers())}`]: 20,
    [`login:email:${email.toLowerCase()}`]: 10,
  });
  if (await limit.blocked()) return { error: TOO_MANY };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  // Same message for every failure so the form doesn't reveal which emails exist.
  if (error) {
    await limit.failed();
    return { error: "That email and password don't match. Try again." };
  }

  // 2FA is required: enter the code if a factor exists, otherwise set one up.
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  redirect(aal?.nextLevel === "aal2" ? "/login/verify" : "/login/enroll");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
