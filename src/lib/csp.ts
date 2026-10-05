// Content-Security-Policy for every page: scripts only from this app, each page's own scripts
// carrying a fresh nonce (Next.js adds it to its scripts by reading this header). The browser
// may talk to Supabase directly (2FA setup); nothing may frame the app.
export function contentSecurityPolicy(nonce: string, supabaseUrl: string, dev: boolean) {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ""}`,
    // style attributes (bar widths) need 'unsafe-inline'; styles can't run code
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    `connect-src 'self' ${supabaseUrl}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(dev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}
