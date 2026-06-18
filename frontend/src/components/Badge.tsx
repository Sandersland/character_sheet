import type { ReactNode } from "react";

type BadgeTone = "garnet" | "arcane" | "gold" | "vitality" | "neutral";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  garnet: "bg-[var(--color-garnet-50)] text-[var(--color-garnet-800)]",
  arcane: "bg-[var(--color-arcane-50)] text-[var(--color-arcane-800)]",
  gold: "bg-[var(--color-gold-50)] text-[var(--color-gold-800)]",
  vitality: "bg-[var(--color-vitality-50)] text-[var(--color-vitality-800)]",
  neutral: "bg-[var(--color-parchment-100)] text-[var(--color-parchment-700)]",
};

/**
 * Soft-background / full-rounded badge — the "safe default for status/
 * category tags" per components.md, used for class/level chips, spell
 * school tags, and the backend health indicator.
 */
export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}
