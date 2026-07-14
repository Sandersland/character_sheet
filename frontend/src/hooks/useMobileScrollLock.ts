import { useEffect } from "react";

// A *real* body scroll-lock for the mobile quick-capture surface (#877).
//
// `useDialogChrome` locks scroll with `body { overflow: hidden }`, which iOS
// Safari does not honor: WebKit treats html/body as one scroll unit and, when
// an input near the bottom is focused, scrolls the whole *layout* viewport up to
// lift the input above the keyboard. That keyboard-driven scroll desyncs the
// visualViewport-pinned capture panel from the page behind it, opening a band
// where sheet content bleeds through between the composer and the keyboard.
//
// The fix is the well-worn iOS trick: pin the body itself with `position: fixed`
// at a negative top equal to the current scroll offset, so the layout viewport
// literally cannot scroll while the keyboard is up; restore the styles and the
// scroll position on unmount. This is layered *in addition to* useDialogChrome's
// overflow lock (which is a harmless no-op on iOS and still correct on desktop),
// and is scoped to this hook so Modal/BottomSheet keep their existing behavior.
//
// The capture surface only ever mounts below `md` (CapturePalette gates on
// useIsBelowMd), so there is no desktop scrollbar-reflow concern to guard.
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
