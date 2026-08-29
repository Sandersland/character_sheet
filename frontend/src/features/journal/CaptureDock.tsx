import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { Session } from "@/types/character";

interface CaptureDockProps {
  session?: Session | null;
  composerRef: React.MutableRefObject<HTMLDivElement | null>;
  onClose: () => void;
  feed: React.ReactNode;
  composer: React.ReactNode;
  anchorKey: number;
}

export default function CaptureDock({
  session,
  composerRef,
  onClose,
  feed,
  composer,
  anchorKey,
}: CaptureDockProps) {
  const dockRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  useDockChrome(dockRef, composerRef, onClose);

  // Only an anchorKey change re-scrolls to bottom; the feed otherwise scrolls freely.
  useEffect(() => {
    const el = feedRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [anchorKey]);
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

      {/* Bottom-pin via mt-auto on the content, not justify-end on this scrollport — justify-end clips start-edge overflow, making older notes unreachable. */}
      <div
        ref={feedRef}
        data-dock-feed=""
        className="flex min-h-0 flex-1 flex-col overflow-y-auto py-2 pl-[26px] pr-[18px]"
      >
        <div className="mt-auto">{feed}</div>
      </div>

      <div className="border-t border-parchment-100 py-3.5 pl-[26px] pr-[18px]">{composer}</div>
    </div>,
    document.body,
  );
}

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
      // The mention popover stopPropagation's its own Escape first, so this only fires once no suggestion list is open.
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
