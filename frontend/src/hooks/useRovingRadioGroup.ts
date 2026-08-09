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

const noneDisabled = () => false;

/**
 * ARIA APG radiogroup keyboard pattern (#1111, extended #1324): exactly one
 * card is in the Tab order (roving tabindex, falling back to the first
 * *enabled* card when none is checked yet -- otherwise the group is
 * unreachable by Tab), arrow keys move focus *and* selection together
 * (wrapping at both ends, skipping disabled options), and Home/End jump to
 * the first/last enabled option.
 *
 * `isDisabled` is optional -- omitting it (SubclassStep, FeatFlow,
 * CreationEntryGate, EditionPicker) keeps every option eligible for
 * navigation, identical to the pre-#1324 behavior. `ClassChoiceStep` is the
 * one caller with real disabled options today.
 */
export function useRovingRadioGroup(
  count: number,
  checkedIndex: number,
  onSelect: (index: number) => void,
  isDisabled: (index: number) => boolean = noneDisabled,
): UseRovingRadioGroupResult {
  const itemsRef = useRef<(HTMLButtonElement | null)[]>([]);

  const itemRef = useCallback(
    (index: number): RefCallback<HTMLButtonElement> =>
      (el) => {
        itemsRef.current[index] = el;
      },
    [],
  );

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

  // Steps from `from` in `delta` direction, wrapping, until it lands on an
  // enabled option; returns `from` unchanged if every option is disabled.
  const step = useCallback(
    (from: number, delta: 1 | -1): number => {
      let next = from;
      for (let i = 0; i < count; i++) {
        next = (next + delta + count) % count;
        if (!isDisabled(next)) return next;
      }
      return from;
    },
    [count, isDisabled],
  );

  const moveFocus = useCallback(
    (next: number) => {
      itemsRef.current[next]?.focus();
      // UA-default focus scrolling has unspecified alignment (Chrome tends to
      // centre); a card list capped by an overflow ancestor (#1343) needs to
      // nudge by one row instead.
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
      if (next < 0) return; // every option disabled -- nothing to move to

      e.preventDefault();
      moveFocus(next);
    },
    [count, step, firstEnabled, lastEnabled, moveFocus],
  );

  return { itemRef, tabIndexFor, keyDownFor };
}
