import { useCallback, useRef, type KeyboardEvent, type RefCallback } from "react";

interface UseRovingRadioGroupResult {
  itemRef: (index: number) => RefCallback<HTMLButtonElement>;
  tabIndexFor: (index: number) => 0 | -1;
  // Bound per-button, not the container: jsx-a11y disallows keydown on a non-focusable role="radiogroup" wrapper.
  keyDownFor: (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => void;
}

const noneDisabled = () => false;

export function useRovingRadioGroup(
  count: number,
  checkedIndex: number,
  onSelect: (index: number) => void,
  isDisabled: (index: number) => boolean = noneDisabled,
): UseRovingRadioGroupResult {
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  // Cached by index so the same index yields the same function reference across renders, since an inline callback per call would make React detach/reattach the ref every render.
  const refCallbacksRef = useRef<Map<number, RefCallback<HTMLButtonElement>>>(new Map());

  const itemRef = useCallback((index: number): RefCallback<HTMLButtonElement> => {
    const cached = refCallbacksRef.current.get(index);
    if (cached) return cached;
    const callback: RefCallback<HTMLButtonElement> = (el) => {
      itemsRef.current[index] = el;
    };
    refCallbacksRef.current.set(index, callback);
    return callback;
  }, []);

  const firstEnabled = useCallback((): number => {
    for (let i = 0; i < count; i++) {
      if (!isDisabled(i)) return i;
    }
    return -1;
  }, [count, isDisabled]);

  const lastEnabled = useCallback((): number => {
    for (let i = count - 1; i >= 0; i--) {
      if (!isDisabled(i)) return i;
    }
    return -1;
  }, [count, isDisabled]);

  const tabIndexFor = useCallback(
    (index: number): 0 | -1 => {
      const fallback = checkedIndex >= 0 && !isDisabled(checkedIndex) ? checkedIndex : firstEnabled();
      return index === fallback ? 0 : -1;
    },
    [checkedIndex, isDisabled, firstEnabled],
  );

  const step = useCallback(
    (from: number, delta: 1 | -1): number => {
      for (let i = 1; i < count; i++) {
        const next = (((from + delta * i) % count) + count) % count;
        if (!isDisabled(next)) return next;
      }
      return -1;
    },
    [count, isDisabled],
  );

  const moveFocus = useCallback(
    (next: number) => {
      itemsRef.current[next]?.focus();
      // UA-default focus scrolling has unspecified alignment; a card list capped by an overflow ancestor (#1343) needs one-row nudges instead.
      itemsRef.current[next]?.scrollIntoView({ block: "nearest" });
      onSelect(next);
    },
    [onSelect],
  );

  const keyDownFor = useCallback(
    (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
      if (count === 0) return;

      let next: number;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") next = step(index, 1);
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = step(index, -1);
      else if (e.key === "Home") next = firstEnabled();
      else if (e.key === "End") next = lastEnabled();
      else return;

      e.preventDefault();
      if (next < 0) return;
      moveFocus(next);
    },
    [count, step, firstEnabled, lastEnabled, moveFocus],
  );

  return { itemRef, tabIndexFor, keyDownFor };
}
