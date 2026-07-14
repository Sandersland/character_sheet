import { useEffect } from "react";

// A *real* iOS body scroll-lock for the mobile quick-capture surface (#877):
// pin the body with `position: fixed; top: -{scrollY}` so the layout viewport
// can't scroll under the keyboard, restoring styles + scroll on unmount.
// `useDialogChrome`'s `overflow: hidden` is a no-op on WebKit (it scrolls the
// whole layout viewport up to lift a focused input above the keyboard), which
// desyncs the pinned panel from the page behind and bleeds sheet content through
// the gap. Capture-specific, so Modal/BottomSheet keep their overflow lock.
export function useMobileScrollLock(): void {
  useEffect(() => {
    const body = document.body;
    const scrollY = window.scrollY;
    const prev = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      width: body.style.width,
    };

    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";

    return () => {
      body.style.position = prev.position;
      body.style.top = prev.top;
      body.style.left = prev.left;
      body.style.right = prev.right;
      body.style.width = prev.width;
      window.scrollTo(0, scrollY);
    };
  }, []);
}
