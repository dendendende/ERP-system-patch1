import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, isRestricted, isSessionExpired } from "@/lib/auth/routes";
import type { Database } from "@/lib/database.types";

const LAST_ACTIVE = "last_active";
const TIMEOUT_MINUTES = Number(process.env.SESSION_TIMEOUT_MINUTES) || 30;

// Every page needs a signed-in user who passed 2FA. The 2FA screens need a signed-in user
// who has not passed it yet. /login is the only public page; /api/cron/* checks its own secret.
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          for (const { name, value } of toSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of toSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // Redirect while keeping any refreshed/cleared auth cookies.
  const redirect = (path: string) => {
    const res = NextResponse.redirect(new URL(path, request.url));
    for (const c of response.cookies.getAll()) res.cookies.set(c);
    return res;
  };

  const path = request.nextUrl.pathname;
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    response.cookies.delete(LAST_ACTIVE);
    return path === "/login" ? response : redirect("/login");
  }

  const now = Date.now();
  const lastActive = Number(request.cookies.get(LAST_ACTIVE)?.value) || null;
  if (isSessionExpired(lastActive, now, TIMEOUT_MINUTES)) {
    await supabase.auth.signOut();
    response.cookies.delete(LAST_ACTIVE);
    return redirect("/login?reason=timeout");
  }
  response.cookies.set(LAST_ACTIVE, String(now), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal2") {
    const step = aal?.nextLevel === "aal2" ? "/login/verify" : "/login/enroll";
    return path === step ? response : redirect(step);
  }
  if (path.startsWith("/login")) return redirect("/");

  if (isRestricted(path)) {
    const { data } = await supabase.from("users").select("role").eq("id", user.id).single();
    if (!canAccess(data?.role, path)) return redirect("/forbidden");
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/cron/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
