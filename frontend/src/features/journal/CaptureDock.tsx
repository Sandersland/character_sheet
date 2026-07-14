// The desktop margin dock (#865): ⌘J slides a 370px journal-edge panel in beside
// the visible sheet (dashed-gold stitch seam) instead of covering it, so you can
// jot while watching HP/initiative. NON-modal — the sheet stays scrollable and
// clickable; there's no scrim and no body scroll-lock. Esc closes while focus is
// inside the dock, and focus returns to whatever opened it. The feed runs newest
// at the BOTTOM with the composer docked below it. md+ only; the mobile capture
// surface stays a BottomSheet (rewritten in #866).

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Session } from "@/types/character";

interface CaptureDockProps {
  /** Live session, when one is active: header shows its title + elapsed time. */
  session?: Session | null;
  /** The editor element, for placing initial focus + scoping Esc/⌘J to the dock. */
  composerRef: React.MutableRefObject<HTMLDivElement | null>;
  onClose: () => void;
  feed: React.ReactNode;
  composer: React.ReactNode;
}

export default function CaptureDock({ session, composerRef, onClose, feed, composer }: CaptureDockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  useDockChrome(dockRef, composerRef, onClose);
  const elapsed = useElapsed(session?.status === "active" ? session.startedAt : undefined);
  const sessionMeta = session ? [session.title, elapsed].filter(Boolean).join(" · ") : "";

  return createPortal(
    <div
      ref={dockRef}
      data-capture-dock=""
      role="dialog"
      aria-label="Quick capture"
      className="fixed right-0 top-0 bottom-0 z-40 hidden w-[370px] flex-col border-l border-parchment-200 bg-parchment-50 shadow-[-14px_0_30px_rgba(39,36,29,0.18)] md:flex"
    >
      {/* Dashed-gold stitch seam running down the page-edge of the dock. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-3 left-[7px] top-3 border-l-2 border-dashed border-gold-600/50"
      />

      <header className="flex items-center justify-between gap-2.5 border-b border-parchment-100 py-3 pl-[26px] pr-[18px]">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.1em] text-parchment-500">
            Quick capture
          </div>
          {sessionMeta && (
            <div className="truncate font-display text-[15px] font-semibold text-parchment-900">
              {sessionMeta}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-garnet-700 hover:underline"
        >
          Close · ⌘J
        </button>
      </header>

      {/* Feed grows to fill; justify-end keeps the newest note pinned to the bottom,
          just above the composer, until there's enough to scroll. */}
      <div className="flex flex-1 flex-col justify-end overflow-y-auto py-2 pl-[26px] pr-[18px]">
        {feed}
      </div>

      <div className="border-t border-parchment-100 py-3.5 pl-[26px] pr-[18px]">{composer}</div>
    </div>,
    document.body,
  );
}

// Non-modal chrome: focus the composer on open (deferred past first paint so it
// lays out first), Esc closes only when focus is inside the dock, and focus
// returns to the opener on close. Deliberately NO body scroll-lock — the sheet
// behind stays interactive.
function useDockChrome(
  dockRef: React.RefObject<HTMLElement | null>,
  composerRef: React.RefObject<HTMLDivElement | null>,
  onClose: () => void,
) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    let raf1 = 0;
    let raf2 = 0;
    raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => composerRef.current?.focus({ preventScroll: true }));
    });

    function handleKeyDown(event: KeyboardEvent) {
      // Only when focus lives in the dock — an unfocused dock leaves the page's Esc alone.
      // The mention popover swallows its own Escape first (stopPropagation), so this
      // fires to close the dock only once no suggestion list is open.
      if (event.key === "Escape" && dockRef.current?.contains(document.activeElement)) {
        onCloseRef.current();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      document.removeEventListener("keydown", handleKeyDown);
      previouslyFocused?.focus?.();
    };
  }, [dockRef, composerRef]);
}

// A live "1h 24m" elapsed string from an ISO start, re-rendered each minute.
function useElapsed(startedAt: string | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [startedAt]);

  if (!startedAt) return "";
  const start = new Date(startedAt).getTime();
  if (Number.isNaN(start)) return "";
  const minutes = Math.max(0, Math.floor((now - start) / 60_000));
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
