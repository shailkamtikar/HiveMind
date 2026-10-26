import { cn } from "@/lib/cn";

/** Hexagon mark with a smaller cell inside: a hive. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("logo-mark size-6", className)} aria-hidden="true">
      <path d="M12 2 21 7v10l-9 5-9-5V7z" fill="var(--accent)" stroke="var(--foreground)" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M12 8.2 16 10.5v4.6l-4 2.3-4-2.3v-4.6z" fill="var(--foreground)" />
    </svg>
  );
}
