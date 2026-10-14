"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Problem } from "@/components/action-form";
import { answer } from "@/lib/db-error";
import { createClient } from "@/lib/supabase/server";

const PATH = "/settings/team";
const ROLES = ["owner", "operator", "viewer"] as const;
type Role = (typeof ROLES)[number];
// Supabase's "banned until": ~100 years. Switching someone off also stops their sign-in and
// ends their session on the next page (the proxy checks the login with the auth server).
const SWITCHED_OFF = "876000h";

export type LinkState = { error?: string; link?: string; name?: string };
export type RowState = { error?: string };

/** The signed-in user's client, only if they are the owner (checked by the database). Every
 * team change goes through it, so RLS, the last-owner rule and the audit log all apply. The
 * auth admin calls below run only after this. */
async function ownerClient() {
  const supabase = await createClient();
  const { data } = await supabase.rpc("current_app_role");
  return data === "owner" ? supabase : null;
}

async function confirmUrl(tokenHash: string, type: "invite" | "recovery") {
  const h = await headers();
  const origin = h.get("origin") ?? `http://${h.get("host")}`;
  return `${origin}/auth/confirm?${new URLSearchParams({ token_hash: tokenHash, type })}`;
}

const lastOwnerMessage = (message: string) =>
  /at least one owner/.test(message)
    ? "The team needs at least one owner. Make someone else an owner first."
    : "Couldn't save that. Try again.";

export async function invite(_prev: LinkState, form: FormData): Promise<LinkState> {
  const name = String(form.get("name") ?? "").trim();
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = String(form.get("role")) as Role;
  if (!name) return { error: "Write their name." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "That email doesn't look right." };
  if (!ROLES.includes(role)) return { error: "Pick what they can do." };

  const supabase = await ownerClient();
  if (!supabase) return { error: "Only the owner can add people." };

  const { data, error } = await createAdminClient().auth.admin.generateLink({
    type: "invite",
    email,
    options: { data: { name } },
  });
  if (error || !data.user) {
    return {
      error:
        error?.code === "email_exists"
          ? "Someone with that email is already on the team."
          : "Couldn't add them. Try again.",
    };
  }
  // New people start as viewer (database default); the owner's own update sets the role, so
  // the audit log records who gave it.
  if (role !== "viewer") {
    const { error: roleError } = await supabase
      .from("users")
      .update({ role })
      .eq("id", data.user.id);
    if (roleError) return { error: "They were added as a viewer; set their role below." };
  }
  revalidatePath(PATH);
  return { name, link: await confirmUrl(data.properties.hashed_token, "invite") };
}

/** A fresh link for someone who hasn't finished joining (the first one expired or got lost).
 * Never for someone who already set up 2-step sign-in: that would let the owner take over
 * their account. */
export async function newLink(_prev: LinkState, form: FormData): Promise<LinkState> {
  const id = String(form.get("id") ?? "");
  const supabase = await ownerClient();
  if (!supabase) return { error: "Only the owner can do this." };

  const admin = createAdminClient();
  const { data } = await admin.auth.admin.getUserById(id);
  const user = data.user;
  if (!user?.email) return { error: "Couldn't find them." };
  if (user.factors?.some((f) => f.status === "verified")) {
    return { error: "They have already joined. They sign in with their own password." };
  }
  const { data: link, error } = await admin.auth.admin.generateLink({
    type: "recovery",
    email: user.email,
  });
  if (error) return { error: "Couldn't make a link. Try again." };
  return {
    name: String(user.user_metadata?.name ?? ""),
    link: await confirmUrl(link.properties.hashed_token, "recovery"),
  };
}

export async function setRole(_prev: RowState, form: FormData): Promise<RowState> {
  const id = String(form.get("id") ?? "");
  const role = String(form.get("role")) as Role;
  if (!ROLES.includes(role)) return { error: "Pick what they can do." };
  const supabase = await ownerClient();
  if (!supabase) return { error: "Only the owner can change roles." };
  const { error } = await supabase.from("users").update({ role }).eq("id", id);
  if (error) return { error: lastOwnerMessage(error.message) };
  revalidatePath(PATH);
  return {};
}

export async function setActive(_prev: RowState, form: FormData): Promise<RowState> {
  const id = String(form.get("id") ?? "");
  const active = form.get("active") === "true";
  const supabase = await ownerClient();
  if (!supabase) return { error: "Only the owner can do this." };

  // The database first: it refuses to switch off the last owner, and once it says no access,
  // RLS hides all data from them right away. Then stop their sign-in.
  const { error } = await supabase.from("users").update({ is_active: active }).eq("id", id);
  if (error) return { error: lastOwnerMessage(error.message) };
  const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, {
    ban_duration: active ? "none" : SWITCHED_OFF,
  });
  revalidatePath(PATH);
  if (banError) {
    return {
      error: active
        ? "Switched on, but their sign-in is still blocked. Try again."
        : "They can no longer see anything, but their sign-in isn't blocked yet. Try again.",
    };
  }
  return {};
}

/** Owner switches 2-step sign-in on or off for everyone (audited; RLS: owner only). */
export async function setTwoFactor(_prev: Problem, form: FormData): Promise<Problem> {
  const supabase = await createClient();
  const saved = answer(
    await supabase
      .from("security_settings")
      .update({ require_two_factor: form.get("required") === "true" })
      .eq("id", true)
      .select("id"),
  );
  if (!saved.error) revalidatePath(PATH);
  return saved;
}
