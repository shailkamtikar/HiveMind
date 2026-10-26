"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";

type Result = { status: "joined" | "already_member"; groupId: string } | { status: "invalid" | "full" } | { status: "error" };

/** Redeems the invitation with a POST as soon as the page opens in a real, signed-in browser. */
export function JoinClient({ token }: { token: string }) {
  const router = useRouter();
  const [result, setResult] = useState<Result | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // Strict Mode runs effects twice in development
    started.current = true;
    (async () => {
      try {
        const res = await fetch("/api/invitations/redeem", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token }),
        });
        if (res.status === 401) {
          router.replace(`/login?next=${encodeURIComponent(`/join/${token}`)}`);
          return;
        }
        const body = (await res.json()) as Result;
        if (!res.ok) return setResult({ status: "error" });
        if ("groupId" in body) {
          router.replace(`/groups/${body.groupId}`);
          return;
        }
        setResult(body);
      } catch {
        setResult({ status: "error" });
      }
    })();
  }, [token, router]);

  if (!result || result.status === "joined" || result.status === "already_member") {
    return (
      <div role="status" className="flex items-center gap-3 text-muted">
        <Spinner /> Joining the conversation…
      </div>
    );
  }

  const copy = {
    invalid: {
      title: "This link doesn’t work",
      body: "It may have expired or been revoked, or it may have been copied incorrectly. Ask the person who invited you for a new one.",
    },
    full: {
      title: "This conversation is full",
      body: "It has reached its member limit. Ask the owner to make room, then try the link again.",
    },
    error: {
      title: "Something went wrong",
      body: "We couldn’t check this invitation. Check your connection and try again.",
    },
  }[result.status];

  return (
    <div data-testid={`join-${result.status}`} className="flex flex-col gap-3">
      <h2 className="font-display text-3xl">{copy.title}</h2>
      <p className="text-muted">{copy.body}</p>
      <div className="mt-2 flex gap-2">
        {result.status === "error" && (
          <Button onClick={() => window.location.reload()}>Try again</Button>
        )}
        <Link
          href="/groups"
          className="inline-flex h-10 items-center justify-center rounded-[var(--radius)] border border-border bg-surface-2 px-4 text-sm font-medium hover:bg-surface"
        >
          Go to my conversations
        </Link>
      </div>
    </div>
  );
}
