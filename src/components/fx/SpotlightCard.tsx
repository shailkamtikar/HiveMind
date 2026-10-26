"use client";

import { useRef, type HTMLAttributes, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

/** A card with a soft accent glow that follows the pointer. The glow is decorative and only shows on hover. */
export function SpotlightCard({ className, children, onPointerMove, ...props }: HTMLAttributes<HTMLDivElement>) {
  const ref = useRef<HTMLDivElement>(null);

  function move(e: PointerEvent<HTMLDivElement>) {
    const el = ref.current;
    if (el) {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    }
    onPointerMove?.(e);
  }

  return (
    <div
      ref={ref}
      onPointerMove={move}
      className={cn("spotlight relative overflow-hidden rounded-[var(--radius)] border border-border bg-surface", className)}
      {...props}
    >
      <div className="spotlight-glow" aria-hidden="true" />
      <div className="relative">{children}</div>
    </div>
  );
}
