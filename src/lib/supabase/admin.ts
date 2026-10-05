import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { env } from "@/lib/env";

/** Service-role client for background jobs, and for the auth admin calls on the team screen
 * (after checking the caller is the owner). Bypasses RLS — never read or write app data with it
 * on behalf of a user. */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new Error("Missing environment variable SUPABASE_SERVICE_ROLE_KEY. See .env.example.");
  return createClient<Database>(env.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
