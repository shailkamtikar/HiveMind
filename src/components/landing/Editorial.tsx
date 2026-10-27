import Link from "next/link";
import type { ReactNode } from "react";

/** "01 ——— HOW IT WORKS": a numbered section header whose rule draws in on scroll. */
export function SectionRule({ n, label }: { n: string; label: string }) {
  return (
    <div className="section-rule">
      <span className="text-accent-text">{n}</span>
      <span className="rule" aria-hidden="true" />
      <span className="text-foreground">{label}</span>
    </div>
  );
}

/** The dark call-to-action card with corner ticks. */
export function TickCard({ href, eyebrow, title, hint }: { href: string; eyebrow: string; title: ReactNode; hint: string }) {
  return (
    <Link href={href} className="tick-card max-w-xl">
      <span className="tick tl" aria-hidden="true" />
      <span className="tick tr" aria-hidden="true" />
      <span className="tick bl" aria-hidden="true" />
      <span className="tick br" aria-hidden="true" />
      <span className="font-mono text-[11px] uppercase tracking-wide opacity-60">{eyebrow}</span>
      <strong className="font-display text-[clamp(26px,3.2vw,38px)] font-normal leading-[1.05] tracking-[-0.012em]">{title}</strong>
      <span className="font-mono text-[12.5px] opacity-60">{hint}</span>
      <span className="arrow" aria-hidden="true">
        →
      </span>
    </Link>
  );
}

/** A headline line that slides up out of a mask. `i` staggers the lines. */
export function Line({ i, children }: { i: number; children: ReactNode }) {
  return (
    <span className="line">
      <span style={{ "--i": i } as React.CSSProperties}>{children}</span>
    </span>
  );
}
