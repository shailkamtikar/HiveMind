import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ResetForm } from "./ResetForm";

export const metadata: Metadata = { title: "Choose a new password · HiveMind" };

// Not a public page: the proxy sends anyone who is not signed in to the sign-in page first.
export default function ResetPasswordPage() {
  return (
    <AuthShell title="Choose a new password" intro="You are signed in through your reset link. Pick a password you will remember this time.">
      <ResetForm />
    </AuthShell>
  );
}
