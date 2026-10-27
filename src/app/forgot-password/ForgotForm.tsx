"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { requestReset, type ForgotState } from "./actions";

const initial: ForgotState = { status: "idle" };

export function ForgotForm() {
  const [state, action, pending] = useActionState(requestReset, initial);

  if (state.status === "sent") {
    return (
      <div role="status" className="flex flex-col gap-3" data-testid="forgot-sent">
        <h2 className="font-display text-2xl">Check your email</h2>
        <p className="text-sm leading-relaxed text-muted">
          If there is an account for <span className="text-foreground">{state.email}</span>, a link to choose a new password is on its way. Open it on this
          device. It may take a minute, and it can land in spam.
        </p>
        <Link href="/login" className="text-sm text-accent-text underline underline-offset-4">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state.email}
        error={state.error}
        required
      />
      <Button type="submit" disabled={pending} className="btn-shine">
        {pending ? "Sending…" : "Send me a reset link"}
      </Button>
      <Link href="/login" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
        Back to sign in
      </Link>
    </form>
  );
}
