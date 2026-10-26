import { NextResponse, type NextRequest } from "next/server";
import { updateSession, withCookiesFrom } from "@/lib/supabase/proxy";

// Paths anyone may open without signing in. Everything else requires a session.
const PUBLIC_PATHS = ["/", "/login", "/auth", "/api/health", "/design", "/privacy", "/join"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((p) => pathname === p || (p !== "/" && pathname.startsWith(`${p}/`)));
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  // Health check must work even if Supabase is misconfigured.
  if (pathname === "/api/health") return NextResponse.next();

  const { user, getResponse } = await updateSession(request);
  const response = getResponse();

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
