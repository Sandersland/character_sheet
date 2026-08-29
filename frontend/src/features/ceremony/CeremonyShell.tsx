import type { ReactNode } from "react";

// Stage vignette uses fixed hex colors, not parchment tokens — riding the tokens flipped it to light-cream in dark theme under a dark nav.
const STAGE_BG = "bg-[radial-gradient(ellipse_70%_55%_at_50%_12%,#4a4230,#1c1913_68%)]";
const STAGE_PAGE = `min-h-dvh ${STAGE_BG} px-4 py-8 sm:px-6 sm:py-12`;
// Pinned to the dynamic viewport so the rail + footer stay on screen and only the card body scrolls.
const STAGE_VIEWPORT = `flex h-dvh flex-col ${STAGE_BG} px-4 py-6 sm:px-6 sm:py-8`;

const PAPER =
  "relative rounded border border-parchment-300 bg-parchment-50 shadow-raised after:pointer-events-none after:absolute after:inset-2 after:rounded-sm after:border after:border-parchment-300 after:content-['']";

export const GHOST_BTN =
  "min-h-11 rounded-control border border-parchment-300 px-4 text-sm font-semibold text-parchment-600 transition-colors hover:bg-parchment-100";

// No label color here — equal-specificity `.text-*` utilities collide by emitted-CSS order, so a shared constant carrying one can silently lose to a caller-appended one (#994).
const PRIMARY_BTN =
  "min-h-11 rounded-control border px-5 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export function CeremonyStage({ layout, children }: { layout: "page" | "viewport"; children: ReactNode }) {
  if (layout === "viewport") {
    return (
      <div className={STAGE_VIEWPORT}>
        <div className="mx-auto flex w-full min-h-0 max-w-3xl flex-1 flex-col">{children}</div>
      </div>
    );
  }
  return (
    <div className={STAGE_PAGE}>
      <div className="mx-auto w-full max-w-3xl">{children}</div>
    </div>
  );
}

export function CeremonyCard({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`${PAPER} ${className}`}>{children}</div>;
}

interface CeremonyFooterProps {
  isFirst: boolean;
  isLast: boolean;
  onCancel: () => void;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
  onConfirm: () => void;
  confirmLabel: string;
  confirmClassName: string;
  submitting: boolean;
  confirmDisabled?: boolean;
}

export function CeremonyFooter({
  isFirst,
  isLast,
  onCancel,
  onBack,
  onContinue,
  canContinue,
  onConfirm,
  confirmLabel,
  confirmClassName,
  submitting,
  confirmDisabled = false,
}: CeremonyFooterProps) {
  return (
    <footer className="mt-6 flex items-center justify-between gap-3 border-t border-parchment-200 pt-4">
      {isFirst ? (
        <button type="button" onClick={onCancel} className={GHOST_BTN}>
          Cancel
        </button>
      ) : (
        <button type="button" onClick={onBack} className={GHOST_BTN}>
          ‹ Back
        </button>
      )}
      {isLast ? (
        <button
          type="button"
          onClick={onConfirm}
          disabled={submitting || confirmDisabled}
          aria-busy={submitting}
          className={`${PRIMARY_BTN} ${confirmClassName}`}
        >
          {confirmLabel}
        </button>
      ) : (
        <button
          type="button"
          onClick={onContinue}
          disabled={!canContinue}
          className={`${PRIMARY_BTN} border-garnet-surface-hover bg-garnet-surface text-garnet-on-surface hover:bg-garnet-surface-hover`}
        >
          Continue ›
        </button>
      )}
    </footer>
  );
}
