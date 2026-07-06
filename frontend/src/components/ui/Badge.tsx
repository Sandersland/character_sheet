import type { ReactNode } from "react";

export type BadgeTone = "garnet" | "arcane" | "gold" | "vitality" | "neutral";

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}

const TONE_CLASSES: Record<BadgeTone, string> = {
  garnet: "bg-garnet-50 text-garnet-800",
  arcane: "bg-arcane-50 text-arcane-800",
  gold: "bg-gold-50 text-gold-800",
  vitality: "bg-vitality-50 text-vitality-800",
  neutral: "bg-parchment-100 text-parchment-700",
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
