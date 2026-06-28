import { createElement } from "react";
import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  /** Renders a small caption-style heading above the card content. */
  title?: string;
  /** Optional element rendered at the right edge of the title row (e.g. a badge). */
  titleAccessory?: ReactNode;
  /**
   * Heading level for the title element (default 3). Bump to 2 when a card is a
   * top-level page section sitting directly under the page's single h1, so the
   * document heading order doesn't skip from h1 straight to h3.
   */
  headingLevel?: 2 | 3;
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
  headingLevel = 3,
}: CardProps) {
  return (
    <section
      className={`rounded-card border border-parchment-200 bg-parchment-50 shadow-card ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-parchment-200 px-4 py-2.5">
          {createElement(
            `h${headingLevel}`,
            {
              className:
                "font-sans text-xs font-semibold uppercase tracking-wide text-parchment-600",
            },
            title
          )}
          {titleAccessory}
        </div>
      )}
      {children}
    </section>
  );
}
