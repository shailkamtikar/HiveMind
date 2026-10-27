import { NextResponse, type NextRequest } from "next/server";
import { safeNext } from "@/lib/auth/safeNext";
import { updateSession, withCookiesFrom } from "@/lib/supabase/proxy";

// Paths anyone may open without signing in. Everything else requires a session.
const PUBLIC_PATHS = ["/", "/login", "/forgot-password", "/auth", "/api/health", "/design", "/privacy", "/join"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Health check must work even if Supabase is misconfigured.
  if (pathname === "/api/health") return NextResponse.next();

  const { user, getResponse } = await updateSession(request);
  const response = getResponse();

  // Already signed in: the sign-in page has nothing to offer, so go where the visitor was headed (or to their conversations).
  if (user && pathname === "/login") {
    return withCookiesFrom(response, NextResponse.redirect(new URL(safeNext(request.nextUrl.searchParams.get("next")), request.url)));
  }

  if (user || isPublic(pathname)) return response;

  if (pathname.startsWith("/api/")) {
    return withCookiesFrom(
      response,
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );
  }

  const loginUrl = request.nextUrl.clone();
  loginUrl.pathname = "/login";
  loginUrl.search = "";
  loginUrl.searchParams.set("next", `${pathname}${search}`);
  return withCookiesFrom(response, NextResponse.redirect(loginUrl));
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
