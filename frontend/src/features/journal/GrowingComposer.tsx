// The two-size quick-capture composer (#865). ONE control that grows: it starts a
// single-line pill and, as the note wraps past one line, relaxes its corners into a
// ruled serif writing card (a faint rule per line) up to ~8 lines, then scrolls
// internally. Enter saves, Shift+Enter breaks a line, IME commits are respected.
// A Private lock toggle and a fixed circular send button sit beneath the field, and
// the @-mention autocomplete anchors ABOVE (the composer lives at a panel's bottom).
//
// Standalone + self-contained so the mobile capture rewrite (#866) can reuse it: it
// owns the draft + Private state and, on a successful save, clears the field, resets
// Private (privacy never leaks forward), and returns focus to the editor.

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { ArrowUp } from "@/components/ui/icons";
import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import { PrivateToggle } from "@/features/journal/NoteFeed";
import type { EntryVisibility } from "@/types/character";

const LINE_PX = 27; // ruled-line rhythm; also the editor line-height.
const CARD_PAD_Y = 16; // editor top+bottom padding in card mode (pt-1 + pb-3).

export interface GrowingComposerProps {
  campaignId?: string | null;
  busy: boolean;
  error: string | null;
  onSave: (body: string, visibility?: EntryVisibility) => Promise<boolean>;
  /** Forwarded to the editor element so a host (the dock) can place initial focus. */
  composerRef?: React.MutableRefObject<HTMLDivElement | null>;
  placeholder?: string;
  /** Show the "↵ save · shift+↵ new line" hint (desktop). */
  showHints?: boolean;
  /** Grow to this many lines before scrolling internally (default 8). */
  maxLines?: number;
}

const FIELD_BASE =
  "border border-parchment-300 bg-parchment-50 transition-[border-radius] duration-150 focus-within:border-garnet-500";
const FIELD_PILL = `${FIELD_BASE} flex min-h-10 items-center rounded-full`;
const FIELD_CARD = `${FIELD_BASE} rounded-[10px]`;

// text-base at mobile widths keeps the field ≥16px so iOS Safari doesn't auto-zoom
// on focus; the 15px serif register kicks in at md+ (the dock).
const EDITOR_BASE =
  "block w-full font-display text-base leading-[27px] md:text-[15px] text-parchment-900 caret-garnet-700 outline-none";
const EDITOR_PILL = `${EDITOR_BASE} px-3.5 py-[6px]`;
// Ruled writing card: a faint rule under each 27px line, tracking the text as it
// scrolls (background-attachment:local) and aligned to the content box.
const EDITOR_CARD =
  `${EDITOR_BASE} rounded-[10px] px-3.5 pt-1 pb-3 overflow-y-auto [background-origin:content-box] [background-attachment:local] ` +
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_26px,var(--color-parchment-100)_26px,var(--color-parchment-100)_27px)]";

// Measure the editor's wrapped-line count from its scrollHeight/line-height and
// derive the pill↔card threshold + the scroll cap. Re-measures on every edit and
// on width changes (ResizeObserver), keeping the component body thin.
function useGrowthMeasure(
  ref: MutableRefObject<HTMLDivElement | null>,
  value: string,
  maxLines: number,
): { grown: boolean; maxHeight: number | undefined } {
  const [lineCount, setLineCount] = useState(1);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const lh = parseFloat(cs.lineHeight) || LINE_PX;
    const content = el.scrollHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    setLineCount(Math.max(1, Math.round(content / lh)));
  }, [ref]);

  useLayoutEffect(() => measure(), [value, measure]);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, measure]);

  const grown = lineCount >= 2;
  return { grown, maxHeight: grown ? maxLines * LINE_PX + CARD_PAD_Y : undefined };
}

export default function GrowingComposer({
  campaignId,
  busy,
  error,
  onSave,
  composerRef,
  placeholder = "Jot a note… @ to tag",
  showHints = true,
  maxLines = 8,
}: GrowingComposerProps) {
  const [value, setValue] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const { grown, maxHeight } = useGrowthMeasure(innerRef, value, maxLines);

  function setRef(el: HTMLDivElement | null) {
    innerRef.current = el;
    if (composerRef) composerRef.current = el;
  }

  const canSave = value.trim() !== "" && !busy;

  async function handleSave() {
    if (!canSave) return;
    // Shared (the in-campaign default) omits visibility; only the opt-out is sent.
    const ok = await onSave(value.trim(), campaignId && isPrivate ? "PRIVATE" : undefined);
    if (ok) {
      setValue("");
      setIsPrivate(false);
      innerRef.current?.focus({ preventScroll: true });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Enter saves; Shift+Enter newlines; isComposing skips an IME-commit Enter.
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSave();
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className={grown ? FIELD_CARD : FIELD_PILL}>
        <MentionAutocomplete
          ref={setRef}
          rows={1}
          aria-label="Quick note"
          campaignId={campaignId}
          className={grown ? EDITOR_CARD : EDITOR_PILL}
          style={maxHeight != null ? { maxHeight } : undefined}
          placeholder={placeholder}
          popoverPlacement="above"
          value={value}
          onChange={setValue}
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="flex items-center gap-3">
        {campaignId && <PrivateToggle checked={isPrivate} onChange={setIsPrivate} label="Private" />}
        {showHints && (
          <p className="text-[11.5px] text-parchment-400">↵ save · shift+↵ new line</p>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave}
          aria-label="Save note"
          className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-garnet-700 text-parchment-50 transition-opacity hover:bg-garnet-800 disabled:opacity-40"
        >
          <ArrowUp aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
        </button>
      </div>

      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}
