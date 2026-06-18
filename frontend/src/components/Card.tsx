import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Renders a small caption-style heading above the card content. */
  title?: string;
  /** Optional element rendered at the right edge of the title row (e.g. a badge). */
  titleAccessory?: ReactNode;
}

/**
 * Base surface used throughout the app: parchment-100 panel, soft card
 * shadow, single shared corner radius (per components.md: "pick one
 * corner-radius convention and reuse it everywhere").
 */
export default function Card({
  children,
  className = "",
  title,
  titleAccessory,
}: CardProps) {
  return (
    <section
      className={`rounded-[var(--radius-card)] border border-[var(--color-parchment-200)] bg-[var(--color-parchment-50)] shadow-[var(--shadow-card)] ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-[var(--color-parchment-200)] px-4 py-2.5">
          <h3 className="font-sans text-xs font-semibold uppercase tracking-wide text-[var(--color-parchment-600)]">
            {title}
          </h3>
          {titleAccessory}
        </div>
      )}
      {children}
    </section>
  );
}
