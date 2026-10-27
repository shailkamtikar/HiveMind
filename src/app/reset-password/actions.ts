"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { fieldErrors, resetSchema } from "@/lib/validation/auth";

export type ResetState = { errors?: Record<string, string> };

/** Sets a new password for the person who is signed in (they arrive here from the emailed link, which signs them in). */
export async function updatePassword(_prev: ResetState, formData: FormData): Promise<ResetState> {
  const parsed = resetSchema.safeParse({
    password: String(formData.get("password") ?? ""),
    confirm: String(formData.get("confirm") ?? ""),
  });
  if (!parsed.success) return { errors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  if (!(await currentUser(supabase))) redirect("/login?next=%2Freset-password");

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    const same = /different from the old|same as the old|should be different/i.test(error.message);
    const weak = error.code === "weak_password" || /weak|pwned|compromised|easy to guess/i.test(error.message);
    return {
      errors: {
        form: same
          ? "Choose a password you have not used before."
          : weak
            ? "That password is too easy to guess. Choose a longer or less common one."
            : "We couldn't change your password. Please try again.",
      },
    };
  }
  redirect("/groups");
}
