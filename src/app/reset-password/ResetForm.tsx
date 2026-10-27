"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation/auth";
import { updatePassword, type ResetState } from "./actions";

const initial: ResetState = {};

export function ResetForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      {state.errors?.form && (
        <p role="alert" data-testid="form-error" className="rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
          {state.errors.form}
        </p>
      )}
      <Input
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder={`At least ${PASSWORD_MIN} characters`}
        maxLength={PASSWORD_MAX}
        error={state.errors?.password}
        required
      />
      <Input label="Type it again" name="confirm" type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} error={state.errors?.confirm} required />
      <Button type="submit" disabled={pending} className="btn-shine">
        {pending ? "Saving…" : "Save new password"}
      </Button>
    </form>
  );
}
