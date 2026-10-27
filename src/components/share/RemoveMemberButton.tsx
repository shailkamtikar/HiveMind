"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

/** Owner-only control next to a member: asks first, then removes them from the conversation. */
export function RemoveMemberButton({ groupId, userId, name }: { groupId: string; userId: string; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/members/${userId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error();
      setOpen(false);
      router.refresh();
    } catch {
      setError("Couldn't remove them. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="ml-auto font-mono text-[11px] uppercase tracking-wide text-muted underline-offset-4 hover:text-danger hover:underline"
        aria-label={`Remove ${name}`}
      >
        Remove
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Remove ${name}?`}>
        <p className="text-sm leading-relaxed">
          {name} loses access to this conversation right away, including its history. Their old messages stay. They can only
          come back if you send them a new invite link.
        </p>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={remove} disabled={busy}>
            {busy ? "Removing…" : "Remove"}
          </Button>
        </div>
      </Dialog>
    </>
  );
}
