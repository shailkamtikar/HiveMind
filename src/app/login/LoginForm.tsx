"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/cn";
import { PASSWORD_MAX, PASSWORD_MIN } from "@/lib/validation/auth";
import { signIn, signUp, type AuthState } from "./actions";

const initial: AuthState = {};

function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" data-testid="form-error" className="rounded-[var(--radius)] border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">
      {message}
    </p>
  );
}

function SignInForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state.errors?.form} />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state.values?.email}
        error={state.errors?.email}
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.errors?.password}
        required
      />
      <Link href="/forgot-password" className="-mt-2 self-start text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
        Forgot your password?
      </Link>
      <Button type="submit" disabled={pending} className="btn-shine">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm({ next }: { next: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  return (
    <form action={action} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormError message={state.errors?.form} />
      <Input
        label="Your name"
        name="name"
        autoComplete="name"
        placeholder="What your friends call you"
        defaultValue={state.values?.name}
        error={state.errors?.name}
        maxLength={40}
        required
      />
      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        placeholder="you@example.com"
        defaultValue={state.values?.email}
        error={state.errors?.email}
        required
      />
      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        placeholder={`At least ${PASSWORD_MIN} characters`}
        error={state.errors?.password}
        maxLength={PASSWORD_MAX}
        required
      />
      <Button type="submit" disabled={pending} className="btn-shine">
        {pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}

export function LoginForm({ next, notice, initialMode = "signin" }: { next: string; notice?: string; initialMode?: "signin" | "signup" }) {
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const tabs = [
    { id: "signin", label: "Sign in" },
    { id: "signup", label: "Create account" },
  ] as const;

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label="Account" className="grid grid-cols-2 gap-1 rounded-[var(--radius)] bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            type="button"
            id={`tab-${t.id}`}
            aria-selected={mode === t.id}
            aria-controls="auth-panel"
            onClick={() => setMode(t.id)}
            className={cn(
              "h-9 rounded-[calc(var(--radius)-4px)] text-sm font-medium transition duration-200",
              mode === t.id ? "bg-surface shadow-sm" : "text-muted hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="alert" className="text-sm text-danger">
          {notice}
        </p>
      )}
      <div id="auth-panel" role="tabpanel" aria-labelledby={`tab-${mode}`} key={mode} className="page-in">
        {mode === "signin" ? <SignInForm next={next} /> : <SignUpForm next={next} />}
      </div>
    </div>
  );
}
