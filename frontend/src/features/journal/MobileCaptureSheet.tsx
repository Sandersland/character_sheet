// The mobile quick-capture surface (#866): a full-height, chat-style capture
// pinned to the visible viewport so the composer docks flush above the iOS
// keyboard. Header (small-caps label · serif session line · Done), a feed that
// reads downward with the newest note adjacent to the composer, and the shared
// growing composer docked at the bottom. Replaces the old BottomSheet mobile
// path; BottomSheet itself is untouched for its other consumers. Dark mode is
// the "Campfire" register automatically via token flips (+ a dark-only gold
// glow low in the feed, in index.css). Focus-trap / Escape / scroll-lock are
// shared with the app's other dialogs via useDialogChrome.

import { useEffect, useRef } from "react";
import type { MutableRefObject, ReactNode } from "react";
import { createPortal } from "react-dom";

import { useDialogChrome } from "@/hooks/useDialogChrome";
import { useMobileScrollLock } from "@/hooks/useMobileScrollLock";
import { useVisualViewport } from "@/hooks/useVisualViewport";
import type { Session } from "@/types/character";

interface MobileCaptureSheetProps {
  /** Live session, when one is active: the header shows its title. */
  session?: Session | null;
  /** The editor element, for placing the deferred initial focus (#784). */
  composerRef: MutableRefObject<HTMLDivElement | null>;
  onClose: () => void;
  feed: ReactNode;
  composer: ReactNode;
  /** Note count — changes re-anchor the feed to the bottom (open + after save). */
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
  // Pin the body with a real position:fixed scroll-lock BEFORE useDialogChrome so
  // the layout viewport can't scroll under the keyboard (the #877 desync source),
  // and so this hook's scroll-restore cleanup runs AFTER the dialog's focus-restore
  // (cleanups run in reverse mount order) — otherwise refocusing the opener could
  // reveal-scroll the page back off-origin as we close.
  useMobileScrollLock();
  const panelRef = useDialogChrome(onClose);
  const feedRef = useRef<HTMLDivElement>(null);
  const { height, offsetTop } = useVisualViewport();
  useDeferredComposerFocus(composerRef);
  const sessionTitle = session?.title?.trim() ?? "";

  // Auto-anchor to the bottom on open and whenever a note is added, and again if
  // the keyboard reflows the panel — the newest entry stays beside the composer.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [anchorKey, height]);

  return createPortal(
    // Full-screen opaque backdrop in the surface colour, sitting *behind* the
    // pinned panel as a safety net: any region the visualViewport-pinned panel
    // doesn't cover (above it when offsetTop > 0, or a transient during the
    // keyboard animation) shows parchment, never the sheet underneath. This only
    // holds because useMobileScrollLock stops iOS scrolling the layout viewport
    // under the keyboard (#877) — otherwise this fixed layer would itself drift.
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

        {/* justify-end keeps the newest note pinned to the bottom until the feed
            overflows; then the anchor effect scrolls it into view. */}
        <div
          ref={feedRef}
          data-mobile-capture-feed=""
          className="flex min-h-0 flex-1 flex-col justify-end overflow-y-auto px-[18px] pb-1 pt-2"
        >
          {feed}
        </div>

        <div className="shrink-0 border-t border-parchment-100 bg-parchment-50 px-3 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
          {composer}
        </div>
      </div>
    </div>,
    document.body,
  );
}

// Small-caps "Quick capture" label over the optional serif session title, with a
// garnet Done close button; top padding clears the notch via the safe-area inset.
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

// Deferred initial focus + the #784 iOS mitigations: focus is placed past first
// paint (double rAF) with preventScroll so Safari doesn't offset the fixed panel
// as the keyboard animates in, and any reveal-scroll that still leaks is pinned
// back to the top.
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
