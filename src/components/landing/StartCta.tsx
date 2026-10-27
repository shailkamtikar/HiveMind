import Link from "next/link";
import { getUser } from "@/lib/auth/getUser";
import { TickCard } from "./Editorial";

/**
 * The landing page's main call-to-action. Someone who is already signed in goes straight to their conversations;
 * someone who is not goes to create an account. Read inside Suspense, so the rest of the page does not wait for it.
 */
export async function StartCta({ variant }: { variant: "hero" | "closing" }) {
  const user = await getUser();
  if (user) {
    return (
      <TickCard
        href="/groups"
        eyebrow="Welcome back"
        title={variant === "hero" ? "Open your conversations" : "Go to your conversations"}
        hint="Pick up where you left off"
      />
    );
  }
  return variant === "hero" ? (
    <>
      <TickCard href="/login?mode=signup" eyebrow="Next" title="Start a conversation" hint="Free to try · email and password · up to five people" />
      <p className="mt-4">
        <Link href="/login" className="text-sm text-muted underline-offset-4 hover:text-foreground hover:underline">
          I already have an account
        </Link>
      </p>
    </>
  ) : (
    <TickCard href="/login?mode=signup" eyebrow="Ready" title="Create an account" hint="Email and password · takes a minute" />
  );
}

/** What shows for a moment while we find out who is looking. Same size as the card, so nothing jumps. */
export function StartCtaFallback() {
  return <div className="h-[132px] max-w-xl animate-pulse bg-surface-2" aria-hidden="true" />;
}
