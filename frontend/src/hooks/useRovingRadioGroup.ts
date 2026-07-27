import { useCallback, useRef, type KeyboardEvent, type RefCallback } from "react";

interface UseRovingRadioGroupResult {
  itemRef: (index: number) => RefCallback<HTMLButtonElement>;
  tabIndexFor: (index: number) => 0 | -1;
  /**
   * Bound per-button (not on the container) to match `Tabs`/`Segmented` --
   * jsx-a11y's interactive-supports-focus rule rejects a keydown on a
   * non-focusable role="radiogroup" wrapper, and roving tabindex means only
   * one button is ever focused, so the two attachment points are
   * behaviorally identical.
   */
  keyDownFor: (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * ARIA APG radiogroup keyboard pattern (#1111): exactly one card is in the Tab
 * order (roving tabindex, falling back to the first card when none is checked
 * yet -- otherwise the group is unreachable by Tab), and arrow keys move focus
 * *and* selection together, wrapping at both ends.
 *
 * FeatDetail's ability-score picker and SubclassStep's subclass cards share
 * this keyboard behavior but render differently-shaped cards, so only the
 * behavior is extracted here, not the markup.
 */
export function useRovingRadioGroup(
  count: number,
  checkedIndex: number,
  onSelect: (index: number) => void,
): UseRovingRadioGroupResult {
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const itemRef = useCallback(
    (index: number): RefCallback<HTMLButtonElement> =>
      (el) => {
        itemsRef.current[index] = el;
      },
    [],
  );

  const tabIndexFor = useCallback(
    (index: number): 0 | -1 => {
      const fallback = checkedIndex < 0 ? 0 : checkedIndex;
      return index === fallback ? 0 : -1;
    },
    [checkedIndex],
  );

  const keyDownFor = useCallback(
    (index: number) => (e: KeyboardEvent<HTMLButtonElement>) => {
      let delta = 0;
      if (e.key === "ArrowRight" || e.key === "ArrowDown") delta = 1;
      else if (e.key === "ArrowLeft" || e.key === "ArrowUp") delta = -1;
      else return;
      if (count === 0) return;

      e.preventDefault();
      const next = (index + delta + count) % count;
      itemsRef.current[next]?.focus();
      // UA-default focus scrolling has unspecified alignment (Chrome tends to
      // centre); a card list capped by an overflow ancestor (#1343) needs to
      // nudge by one row instead.
      itemsRef.current[next]?.scrollIntoView({ block: "nearest" });
      onSelect(next);
    },
    [count, onSelect],
  );

  return { itemRef, tabIndexFor, keyDownFor };
}
