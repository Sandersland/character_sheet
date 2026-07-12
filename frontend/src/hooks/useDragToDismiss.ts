import { useEffect, useRef, type PointerEvent as ReactPointerEvent, type RefObject } from "react";

const DISMISS_DISTANCE_RATIO = 1 / 3;
const FLICK_VELOCITY = 0.5;
const SPRING_MS = 220;

export interface DragDecisionInput {
  dy: number;
  sheetHeight: number;
  velocity: number;
}

/** Pure verdict: does this released drag dismiss, or spring back? */
export function shouldDismissDrag({ dy, sheetHeight, velocity }: DragDecisionInput): boolean {
  if (dy <= 0) return false;
  if (velocity >= FLICK_VELOCITY) return true;
  return dy >= sheetHeight * DISMISS_DISTANCE_RATIO;
}

interface Options {
  onDismiss: () => void;
  enabled?: boolean;
}

/**
 * Drag-down-to-dismiss for a bottom-anchored panel: the finger translates the
 * panel via a CSS transform, and on release it either dismisses (past ~1/3 the
 * sheet height or a downward flick) or springs back. Returns pointer handlers
 * for an always-draggable region (grabber/header) and a content region that
 * only engages when scrolled to the top and dragged downward. Honors
 * prefers-reduced-motion by deciding the same verdict without the follow/spring.
 */
export function useDragToDismiss(panelRef: RefObject<HTMLElement>, { onDismiss, enabled = true }: Options) {
  const onDismissRef = useRef(onDismiss);
  onDismissRef.current = onDismiss;

  const drag = useRef<{
    active: boolean;
    armed: boolean;
    startY: number;
    lastY: number;
    lastT: number;
    velocity: number;
  } | null>(null);

  const reducedMotion = useRef(false);
  useEffect(() => {
    reducedMotion.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  function follow(dy: number) {
    const panel = panelRef.current;
    if (!panel || reducedMotion.current) return;
    panel.style.transition = "none";
    panel.style.transform = `translateY(${Math.max(0, dy)}px)`;
  }

  function settle(dismiss: boolean) {
    const panel = panelRef.current;
    if (dismiss) {
      onDismissRef.current();
      return;
    }
    if (!panel || reducedMotion.current) return;
    panel.style.transition = `transform ${SPRING_MS}ms ease-out`;
    panel.style.transform = "translateY(0)";
  }

  function begin(e: ReactPointerEvent, y: number) {
    drag.current = { active: true, armed: false, startY: y, lastY: y, lastT: performance.now(), velocity: 0 };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onMove(e: ReactPointerEvent) {
    const d = drag.current;
    if (!d) return;
    const dy = e.clientY - d.startY;
    const now = performance.now();
    const dt = now - d.lastT;
    if (dt > 0) d.velocity = (e.clientY - d.lastY) / dt;
    d.lastY = e.clientY;
    d.lastT = now;

    // Content region: only engage the drag once the finger moves downward.
    if (d.armed) {
      if (dy <= 0) return;
      d.armed = false;
      d.active = true;
      e.currentTarget.setPointerCapture?.(e.pointerId);
    }
    if (d.active) follow(dy);
  }

  function onUp(e: ReactPointerEvent) {
    const d = drag.current;
    drag.current = null;
    if (!d?.active) return;
    const dy = e.clientY - d.startY;
    const sheetHeight = panelRef.current?.getBoundingClientRect().height ?? 0;
    settle(shouldDismissDrag({ dy, sheetHeight, velocity: d.velocity }));
  }

  // A cancelled pointer (e.g. OS gesture takeover) never dismisses — spring back.
  function onCancel() {
    const d = drag.current;
    drag.current = null;
    if (d?.active) settle(false);
  }

  const handleProps = enabled
    ? {
        onPointerDown: (e: ReactPointerEvent) => begin(e, e.clientY),
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onCancel,
      }
    : {};

  const contentProps = enabled
    ? {
        onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
          if (e.currentTarget.scrollTop > 0) return;
          const y = e.clientY;
          drag.current = { active: false, armed: true, startY: y, lastY: y, lastT: performance.now(), velocity: 0 };
        },
        onPointerMove: onMove,
        onPointerUp: onUp,
        onPointerCancel: onCancel,
      }
    : {};

  return { handleProps, contentProps };
}
