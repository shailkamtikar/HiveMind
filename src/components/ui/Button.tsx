import { cn } from "@/lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger";

const variants: Record<Variant, string> = {
  primary: "btn-shine bg-accent text-accent-foreground hover:brightness-105",
  secondary: "bg-surface-2 text-foreground border border-border hover:bg-surface",
  ghost: "text-foreground hover:bg-surface-2",
  danger: "bg-danger text-background hover:brightness-110",
};

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={cn(
        "inline-flex h-10 items-center justify-center gap-2 rounded-[var(--radius)] px-4 text-sm font-medium",
        "transition duration-150 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        className,
      )}
      {...props}
    />
  );
}
