import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, isRestricted, isSessionExpired } from "@/lib/auth/routes";
import { contentSecurityPolicy } from "@/lib/csp";
import { clientIp } from "@/lib/client-ip";
import type { Database } from "@/lib/database.types";

const LAST_ACTIVE = "last_active";
const DEVICE = "device";
const CONFIRM = "/auth/confirm";
const SET_PASSWORD = "/login/set-password";
const TIMEOUT_MINUTES = Number(process.env.SESSION_TIMEOUT_MINUTES) || 30;

// Every page needs a signed-in user who passed 2FA. The 2FA screens need a signed-in user
// who has not passed it yet. /login and /auth/confirm (opening an invite link) are the only public
// pages; /api/cron/* checks its own secret.
export async function proxy(request: NextRequest) {
  const csp = contentSecurityPolicy(
    btoa(crypto.randomUUID()),
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NODE_ENV === "development",
  );
  // Next.js reads the nonce from the request header and puts it on the page's scripts.
  request.headers.set("Content-Security-Policy", csp);
  const response = await guard(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function guard(request: NextRequest) {
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
    return path === "/login" || path === CONFIRM ? response : redirect("/login");
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
  // 2-step sign-in can be switched off by the owner (Settings → Team); the database reads the
  // same switch, so data access follows it too.
  const needsTwoFactor =
    aal?.currentLevel !== "aal2" && (await supabase.rpc("two_factor_required")).data !== false;
  if (needsTwoFactor) {
    const step = aal?.nextLevel === "aal2" ? "/login/verify" : "/login/enroll";
    // Someone who just opened an invite link chooses a password before setting up 2FA.
    const allowed =
      path === step || path === CONFIRM || (step === "/login/enroll" && path === SET_PASSWORD);
    return allowed ? response : redirect(step);
  }
  // First page after 2FA in a browser we haven't seen this person use: note the device so the
  // owner sees it on Home. The cookie names the person too, so a shared computer counts as
  // new for each of them.
  if (!request.cookies.get(DEVICE)?.value.startsWith(`${user.id}.`)) {
    const deviceId = crypto.randomUUID();
    await supabase.from("sign_in_devices").insert({
      user_id: user.id,
      device_id: deviceId,
      user_agent: request.headers.get("user-agent")?.slice(0, 300) ?? null,
      ip: clientIp(request.headers),
    });
    response.cookies.set(DEVICE, `${user.id}.${deviceId}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 400 * 24 * 3600,
    });
  }

  // signed in: the sign-in pages are done with, except choosing a password after an invite
  if (path.startsWith("/login") && path !== SET_PASSWORD) return redirect("/");

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
