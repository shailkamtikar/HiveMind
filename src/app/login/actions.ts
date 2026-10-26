"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { safeNext } from "@/lib/auth/safeNext";
import { fieldErrors, signInSchema, signUpSchema } from "@/lib/validation/auth";

export type AuthState = {
  /** Field name -> message. `form` is a message about the whole form. */
  errors?: Record<string, string>;
  /** Values to put back in the form after an error (never the password). */
  values?: { name?: string; email?: string };
};

const text = (formData: FormData, key: string) => String(formData.get(key) ?? "");
const isRateLimited = (e: { status?: number; message: string }) => e.status === 429 || /rate limit/i.test(e.message);

export async function signIn(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse({ email: text(formData, "email"), password: text(formData, "password") });
  const email = text(formData, "email").trim();
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values: { email } };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      errors: {
        form: isRateLimited(error)
          ? "Too many attempts. Wait a few minutes and try again."
          : "Incorrect email or password.",
      },
      values: { email },
    };
  }
  redirect(safeNext(text(formData, "next")));
}

export async function signUp(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const raw = { name: text(formData, "name"), email: text(formData, "email"), password: text(formData, "password") };
  const parsed = signUpSchema.safeParse(raw);
  const values = { name: raw.name.trim(), email: raw.email.trim() };
  if (!parsed.success) return { errors: fieldErrors(parsed.error), values };

  // The account is created already-confirmed so sign-up never waits on an inbox, then signed in right away.
  const { error: createError } = await createAdminClient().auth.admin.createUser({
    email: parsed.data.email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { full_name: parsed.data.name },
  });
  if (createError) {
    const exists = createError.status === 422 || /already|registered|exists/i.test(createError.message);
    return {
      errors: {
        form: exists
          ? "An account with this email already exists. Sign in instead."
          : "We couldn't create your account. Please try again.",
      },
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: parsed.data.email, password: parsed.data.password });
  if (error) return { errors: { form: "Account created, but sign-in failed. Try signing in." }, values };
  redirect(safeNext(text(formData, "next")));
}
