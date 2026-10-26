"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

// Uses the native <dialog> element: focus trapping, Esc to close and an inert background come built in.
export function Dialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={titleId}
      className="m-auto w-[min(92vw,28rem)] rounded-[var(--radius)] border border-border bg-surface p-6 text-foreground"
    >
      <h2 id={titleId} className="font-display text-2xl">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </dialog>
  );
}
