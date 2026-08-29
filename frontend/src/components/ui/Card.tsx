import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  titleAccessory?: ReactNode;
  /** Bump to 2 when the card sits directly under the page's single h1, so heading order doesn't skip from h1 to h3. */
  headingLevel?: 2 | 3;
}

export default function Card({
  children,
  className = "",
  title,
  titleAccessory,
  headingLevel = 3,
}: CardProps) {
  const HeadingTag = `h${headingLevel}` as "h2" | "h3";
  return (
    <section
      className={`surface-grain relative rounded-card border border-parchment-200 bg-parchment-50 shadow-card ${className}`}
    >
      {title && (
        <div className="flex items-center justify-between gap-2 border-b border-parchment-200 px-4 py-2.5">
          <HeadingTag className="font-sans text-xs font-semibold uppercase tracking-wide text-parchment-600">
            {title}
          </HeadingTag>
          {titleAccessory}
        </div>
      )}
      {children}
    </section>
  );
}
