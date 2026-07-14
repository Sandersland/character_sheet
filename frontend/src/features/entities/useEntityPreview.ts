import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { getPreviewConnections, getPreviewStats } from "@/features/entities/entityPreviewData";
import type { CampaignEntity, EntityConnection, EntityStats } from "@/types/character";

// Hover-intent controller for EntityPreviewCard: desktop-only (pointer: fine), 300ms delay.

export type PreviewEntity = Pick<
  CampaignEntity,
  "id" | "name" | "type" | "aliases" | "notes" | "visibility"
>;

export interface EntityPreview {
  entity: PreviewEntity;
  anchorRect: DOMRect;
  stats?: EntityStats;
  connections?: EntityConnection[];
}

const HOVER_INTENT_MS = 300;

export function useEntityPreview(campaignId: string | null | undefined) {
  const [open, setOpen] = useState<EntityPreview | null>(null);
  const timerRef = useRef<number | null>(null);
  const finePointer = useRef<boolean | null>(null);
  const isOpen = open !== null;

  const cancelTimer = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    cancelTimer();
    setOpen(null);
  }, [cancelTimer]);

  useEffect(() => cancelTimer, [cancelTimer]);

  useEffect(() => {
    if (!isOpen) return;
    const onScroll = () => setOpen(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // Capture + stop so a Modal underneath doesn't also dismiss itself.
      event.stopPropagation();
      setOpen(null);
    };
    window.addEventListener("scroll", onScroll, { capture: true, passive: true });
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [isOpen]);

  const show = useCallback(
    (entity: PreviewEntity, anchorRect: DOMRect) => {
      if (!campaignId) return;
      setOpen({ entity, anchorRect });
      void getPreviewStats(campaignId).then((map) => {
        setOpen((cur) =>
          cur && cur.entity.id === entity.id ? { ...cur, stats: map.get(entity.id) } : cur,
        );
      });
      void getPreviewConnections(campaignId, entity.id).then((connections) => {
        setOpen((cur) => (cur && cur.entity.id === entity.id ? { ...cur, connections } : cur));
      });
    },
    [campaignId],
  );

  const triggerProps = useCallback(
    (entity: PreviewEntity) => ({
      onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
        if (!campaignId) return;
        finePointer.current ??= window.matchMedia("(pointer: fine)").matches;
        if (!finePointer.current) return;
        const target = event.currentTarget;
        cancelTimer();
        timerRef.current = window.setTimeout(() => {
          timerRef.current = null;
          show(entity, target.getBoundingClientRect());
        }, HOVER_INTENT_MS);
      },
      onPointerLeave: close,
    }),
    [campaignId, cancelTimer, close, show],
  );

  return { open, triggerProps };
}
