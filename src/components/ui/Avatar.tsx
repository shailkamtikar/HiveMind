import { cn } from "@/lib/cn";

export function Avatar({ name, className }: { name: string; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  return (
    <span
      role="img"
      aria-label={name}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-full border border-border bg-surface-2 text-xs font-medium",
        className,
      )}
    >
      {initials || "?"}
    </span>
  );
}
