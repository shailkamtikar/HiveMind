import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { ForgotForm } from "./ForgotForm";

export const metadata: Metadata = { title: "Forgot your password? · HiveMind" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell title="Forgot your password?" intro="Enter the email you signed up with and we will send you a link to choose a new one.">
      <ForgotForm />
    </AuthShell>
  );
}
