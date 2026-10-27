"use server";

import { cookies, headers } from "next/headers";
import { siteUrl } from "@/lib/siteUrl";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, forgotSchema } from "@/lib/validation/auth";

export type ForgotState = { status: "idle" | "sent"; error?: string; email?: string };

const NEXT_COOKIE = "hm_next"; // keep in sync with src/app/auth/callback/route.ts

/**
 * Sends a password-reset email. The answer is the same whether or not an account exists, so this page cannot be used
 * to find out who has an account. The link signs the person in and sends them to the "choose a new password" page.
 */
export async function requestReset(_prev: ForgotState, formData: FormData): Promise<ForgotState> {
  const raw = String(formData.get("email") ?? "");
  const parsed = forgotSchema.safeParse({ email: raw });
  if (!parsed.success) return { status: "idle", error: fieldErrors(parsed.error).email ?? "Enter a valid email address.", email: raw.trim() };

  const h = await headers();
  const base = siteUrl(h.get("origin") || `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`);

  // Where to go once the link has signed them in (the callback reads this; it only ever accepts local paths).
  (await cookies()).set(NEXT_COOKIE, "/reset-password", {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 60,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${base}/auth/callback`,
  });
  if (error && (error.status === 429 || /rate limit|too many|seconds/i.test(error.message))) {
    return { status: "idle", error: "Too many reset emails were requested. Wait a few minutes and try again.", email: parsed.data.email };
  }
  // Any other outcome looks the same from outside.
  return { status: "sent", email: parsed.data.email };
}
