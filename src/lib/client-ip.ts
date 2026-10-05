/** The visitor's address. On Vercel the first x-forwarded-for entry is set by the platform. */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0].trim() || headers.get("x-real-ip") || "unknown"
  );
}
