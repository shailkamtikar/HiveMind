"use client";

import { useState, type KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";

export function Composer({
  maxLength,
  blockedReason,
  onSend,
}: {
  maxLength: number;
  /** When set, sending is blocked and this explains why (the draft is kept). */
  blockedReason?: string;
  onSend: (content: string) => void;
}) {
  const [value, setValue] = useState("");
  const trimmed = value.trim();
  const tooLong = trimmed.length > maxLength;
  const canSend = trimmed.length > 0 && !tooLong && !blockedReason;

  function submit() {
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter sends; Shift+Enter adds a line. Ignore Enter while an IME composition is active.
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  }

  const nearLimit = trimmed.length > maxLength * 0.8;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="border-t border-border p-3"
    >
      <label htmlFor="composer" className="sr-only">
        Message
      </label>
      <div className="flex items-end gap-2">
        <textarea
          id="composer"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          rows={2}
          placeholder="Write a message…"
          aria-describedby="composer-hint"
          className="max-h-40 min-h-[2.75rem] flex-1 resize-y rounded-[var(--radius)] border border-border bg-surface px-3 py-2 text-[15px] placeholder:text-muted"
        />
        <Button type="submit" disabled={!canSend}>
          Send
        </Button>
      </div>
      <p id="composer-hint" className="mt-1.5 flex justify-between font-mono text-[11px] uppercase tracking-wide text-muted">
        <span data-testid="composer-hint-text">{blockedReason ?? "Enter to send · Shift+Enter for a new line"}</span>
        {nearLimit && (
          <span className={tooLong ? "text-danger" : undefined} data-testid="char-count">
            {trimmed.length}/{maxLength}
          </span>
        )}
      </p>
    </form>
  );
}
