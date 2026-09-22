import { createHash, timingSafeEqual } from "node:crypto";

// Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
export function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secret}`),
  );
}
