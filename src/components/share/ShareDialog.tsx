"use client";

import { useCallback, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";

type Invitation = { id: string; created_at: string; expires_at: string };

const fmt = (iso: string) => new Date(iso).toLocaleString("en", { dateStyle: "medium", timeStyle: "short" });

export function ShareDialog({ groupId, groupName, memberCount, memberLimit }: {
  groupId: string;
  groupName: string;
  memberCount: number;
  memberLimit: number;
}) {
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<{ url: string; expires_at: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [active, setActive] = useState<Invitation[] | null>(null);
  const linkRef = useRef<HTMLInputElement>(null);

  const loadActive = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}/invitations`);
      if (!res.ok) throw new Error();
      setActive((await res.json()).invitations as Invitation[]);
    } catch {
      setActive([]);
    }
  }, [groupId]);

  function openDialog() {
    setOpen(true);
    void loadActive();
  }

  function close() {
    setOpen(false);
    // Closing forgets the link: it cannot be shown again, and the next share starts with the notice.
    setLink(null);
    setAck(false);
    setError(null);
    setCopied(false);
  }

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : "Could not create the link.");
      setLink({ url: body.invitation.url, expires_at: body.invitation.expires_at });
      setCopied(false);
      void loadActive();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the link.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
    } catch {
      linkRef.current?.select(); // clipboard blocked: leave it selected so Ctrl+C works
    }
    setCopied(true);
  }

  async function revoke(id: string) {
    setError(null);
    const res = await fetch(`/api/groups/${groupId}/invitations/${id}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) setError("Could not revoke that link. Try again.");
    void loadActive();
  }

  const full = memberCount >= memberLimit;

  return (
    <>
      <Button variant="secondary" onClick={openDialog}>
        Share
      </Button>
      <Dialog open={open} onClose={close} title={`Share “${groupName}”`}>
        <div className="flex flex-col gap-4">
          <section
            aria-label="Privacy notice"
            className="rounded-[var(--radius)] border-2 border-accent bg-accent/10 p-4 text-sm leading-relaxed"
          >
            <p className="font-mono text-[11px] uppercase tracking-wide text-accent-text">Before you share</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>This conversation becomes a shared one. Anyone with the link can join.</li>
              <li>New members can read the <strong>entire history</strong>.</li>
              <li>Every message is visible to all members and is sent to Google Gemini so the AI can reply.</li>
            </ul>
          </section>

          {full && (
            <p role="status" className="text-sm text-muted">
              This conversation is full ({memberCount}/{memberLimit}). New links will not let anyone in until a seat opens.
            </p>
          )}

          {!link ? (
            <>
              <label className="flex cursor-pointer items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={ack}
                  onChange={(e) => setAck(e.target.checked)}
                  className="mt-0.5 size-4 accent-[var(--accent)]"
                />
                <span>I understand and want to share this conversation.</span>
              </label>
              <Button onClick={create} disabled={!ack || busy}>
                {busy ? "Creating…" : "Create invite link"}
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2" data-testid="invite-link-panel">
              <label htmlFor="invite-link" className="text-sm font-medium">
                Invite link
              </label>
              <div className="flex gap-2">
                <input
                  id="invite-link"
                  ref={linkRef}
                  readOnly
                  value={link.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="h-10 min-w-0 flex-1 rounded-[var(--radius)] border border-border bg-surface-2 px-3 font-mono text-xs"
                />
                <Button onClick={copy} variant="secondary">
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                Expires {fmt(link.expires_at)}. This is the only time the link is shown; create another if you lose it.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}

          <section aria-label="Active links">
            <h3 className="font-mono text-[11px] uppercase tracking-wide text-muted">Active links</h3>
            {active === null ? (
              <p className="mt-2 text-sm text-muted">Loading…</p>
            ) : active.length === 0 ? (
              <p className="mt-2 text-sm text-muted" data-testid="no-active-links">No active links.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-2">
                {active.map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 text-sm" data-testid="active-link">
                    <span className="text-muted">
                      Created {fmt(i.created_at)} · expires {fmt(i.expires_at)}
                    </span>
                    <Button variant="ghost" className="h-8 px-2 text-danger" onClick={() => revoke(i.id)} aria-label={`Revoke link created ${fmt(i.created_at)}`}>
                      Revoke
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex justify-end">
            <Button variant="ghost" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
