import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safeNext";

const NEXT_COOKIE = "hm_next";
const OTP_TYPES: EmailOtpType[] = ["magiclink", "email", "signup", "recovery", "invite", "email_change"];

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const supabase = await createClient();
  let ok = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    ok = !error;
  } else if (tokenHash && type && OTP_TYPES.includes(type)) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    ok = !error;
  }

  if (!ok) {
    return NextResponse.redirect(new URL("/login?error=link", origin));
  }

  const target = safeNext(request.cookies.get(NEXT_COOKIE)?.value);
  const response = NextResponse.redirect(new URL(target, origin));
  response.cookies.delete(NEXT_COOKIE);
  return response;
}
