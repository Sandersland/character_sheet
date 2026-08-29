import { useEffect, useRef } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDialogChrome } from "@/hooks/useDialogChrome";
import { useMobileScrollLock } from "@/hooks/useMobileScrollLock";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import type { Session } from "@/types/character";

interface MobileCaptureSheetProps {
  session?: Session | null;
  composerRef: MutableRefObject<HTMLDivElement | null>;
  onClose: () => void;
  feed: ReactNode;
  composer: ReactNode;
  /** Opaque change-detector — any change re-anchors the feed to the bottom. */
  anchorKey: number;
}

export default function MobileCaptureSheet({
  session,
  composerRef,
  onClose,
  feed,
  composer,
  anchorKey,
}: MobileCaptureSheetProps) {
  // useMobileScrollLock must run before useDialogChrome — reverse mount order avoids the opener's focus-restore revealing a scroll offset on close (#877).
  useMobileScrollLock();
  const panelRef = useDialogChrome(onClose);
  const feedRef = useRef<HTMLDivElement>(null);
  const { height, offsetTop } = useVisualViewport();
  useDeferredComposerFocus(composerRef);
  const sessionTitle = session?.title?.trim() ?? "";

  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [anchorKey, height]);

  return createPortal(
    // Safety-net background behind the pinned panel — relies on the body-lock pinning the layout viewport (#877).
    <div role="presentation" className="fixed inset-0 z-50 bg-parchment-50">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Quick capture"
        tabIndex={-1}
        style={{ height: `${height}px`, transform: `translateY(${offsetTop}px)` }}
        className="fixed inset-x-0 top-0 flex flex-col bg-parchment-50 focus-visible:outline-none"
      >
        <CaptureHeader sessionTitle={sessionTitle} onClose={onClose} />

        {/* mt-auto (not justify-end) — justify-end clips start-edge overflow with no scroll range, making older notes unreachable. */}
        <div
          ref={feedRef}
          data-mobile-capture-feed=""
          className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[18px] pb-1 pt-2"
        >
          <div className="mt-auto">{feed}</div>
        </div>

        <div className="shrink-0 border-t border-parchment-100 bg-parchment-50 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          {composer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function CaptureHeader({ sessionTitle, onClose }: { sessionTitle: string; onClose: () => void }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-3 border-b border-parchment-100 px-[18px] pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-parchment-500">
          Quick capture
        </div>
        {sessionTitle && (
          <div className="truncate font-display text-[15px] font-semibold text-parchment-900">
            {sessionTitle}
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        className="shrink-0 px-1 py-2 text-[15px] font-semibold text-garnet-700 hover:underline"
      >
        Done
      </button>
    </header>
  );
}

// Double rAF + preventScroll stops Safari offsetting the fixed panel as the keyboard animates in (#784); any leak is repinned to 0.
function useDeferredComposerFocus(composerRef: MutableRefObject<HTMLDivElement | null>) {
  useEffect(() => {
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        composerRef.current?.focus({ preventScroll: true });
        if (window.scrollY !== 0) window.scrollTo(0, 0);
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [composerRef]);
}
