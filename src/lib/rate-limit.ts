import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

export { clientIp } from "@/lib/client-ip";

const WINDOW_SECONDS = 15 * 60;

/**
 * Failed-attempt limits for public forms, kept in the database (serverless instances share no
 * memory). `limits` maps a key to how many failures it may have in 15 minutes. Only failures
 * count, so people who get it right are never slowed down.
 */
export function rateLimit(limits: Record<string, number>) {
  const db = createAdminClient();
  return {
    /** True when any key is over its limit. If the check itself fails, the answer is yes. */
    async blocked() {
      const answers = await Promise.all(
        Object.entries(limits).map(([key, max]) =>
          db.rpc("too_many_failures", { p_key: key, p_max: max, p_window_seconds: WINDOW_SECONDS }),
        ),
      );
      return answers.some((a) => a.error || a.data);
    },
    async failed() {
      await Promise.all(
        Object.keys(limits).map((key) =>
          db.rpc("record_failure", { p_key: key, p_window_seconds: WINDOW_SECONDS }),
        ),
      );
    },
  };
}

export const TOO_MANY = "Too many tries. Wait 15 minutes and try again.";
