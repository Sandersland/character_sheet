/**
 * AbilityRowShell — the shared <li> anatomy of the class-ability rows
 * (ManeuverRow / ShadowArtRow, #688): an expandable
 * name-toggle with inline chips, a right-aligned action cluster, an optional
 * warning line, and the expandable body. Owns the expanded state; the rows
 * keep their own cast/forget semantics.
 */

import { useState, type ReactNode } from "react";

interface AbilityRowShellProps {
  name: string;
  /** Inline chips rendered after the name (focus cost, concentration, buff). */
  chips?: ReactNode;
  /** Right-aligned action cluster (focus select, Cast, Swap, Forget). */
  actions: ReactNode;
  /** Optional line between the header and the expandable body. */
  warning?: ReactNode;
  /** Expandable body (description + roll/save previews). */
  children: ReactNode;
}

export default function AbilityRowShell({ name, chips, actions, warning, children }: AbilityRowShellProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <li className="border-b border-parchment-200 py-2.5 last:border-0">
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex flex-1 items-baseline gap-1.5 text-left"
          aria-expanded={expanded}
        >
          <span className="text-sm font-semibold text-parchment-900">{name}</span>
          {chips}
          <span className="text-[10px] text-parchment-400" aria-hidden="true">
            {expanded ? "▲" : "▼"}
          </span>
        </button>
        <div className="flex shrink-0 items-center gap-1.5">{actions}</div>
      </div>
      {warning}
      {expanded && <div className="mt-1.5 pr-2">{children}</div>}
    </li>
  );
}

/** The gold Cast affordance every castable row shares (disabled ⇒ explains why via title). */
export function CastAbilityButton({
  disabled,
  onClick,
  title,
}: {
  disabled: boolean;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-control bg-gold-400 px-2.5 py-0.5 text-[11px] font-semibold text-ink hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-40"
      title={title}
    >
      Cast
    </button>
  );
}
