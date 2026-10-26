"use server";

import { cookies, headers } from "next/headers";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/auth/safeNext";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string; email?: string };

const emailSchema = z.email().max(254);

const NEXT_COOKIE = "hm_next"; // keep in sync with src/app/auth/callback/route.ts

export async function sendMagicLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = emailSchema.safeParse(String(formData.get("email") ?? "").trim().toLowerCase());
  if (!parsed.success) {
    return { status: "error", message: "Enter a valid email address." };
  }
  const email = parsed.data;

  const h = await headers();
  const base =
    process.env.APP_BASE_URL ||
    h.get("origin") ||
    `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  // `next` travels in a short-lived cookie: Supabase only accepts exact redirect URLs.
  const store = await cookies();
  store.set(NEXT_COOKIE, safeNext(String(formData.get("next") ?? "")), {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 60 * 30,
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${base.replace(/\/$/, "")}/auth/callback` },
  });

  if (error) {
    const limited = error.status === 429 || /rate limit/i.test(error.message);
    return {
      status: "error",
      message: limited
        ? "Too many sign-in emails were requested. Please wait a few minutes and try again."
        : "We couldn't send the sign-in link. Please try again.",
    };
  }
  return { status: "sent", email };
}
