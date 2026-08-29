import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { ArrowUp } from "@/components/ui/icons";
import MentionAutocomplete from "@/features/journal/MentionAutocomplete";
import { PrivateLockButton, PrivateToggle } from "@/features/journal/NoteFeed";
import type { EntryVisibility } from "@/types/character";

const LINE_PX = 27; // must match EDITOR_BASE's leading-[27px].
const CARD_PAD_Y = 16; // must match EDITOR_CARD's pt-1 + pb-3.

export interface GrowingComposerProps {
  campaignId?: string | null;
  busy: boolean;
  error: string | null;
  onSave: (body: string, visibility?: EntryVisibility) => Promise<boolean>;
  composerRef?: React.MutableRefObject<HTMLDivElement | null>;
  placeholder?: string;
  showHints?: boolean;
  maxLines?: number;
  variant?: "dock" | "mobile";
}

const FIELD_BASE =
  "border border-parchment-300 bg-parchment-50 transition-[border-radius] duration-150 focus-within:border-garnet-500";
const FIELD_PILL = `${FIELD_BASE} flex min-h-10 items-center rounded-full`;
const FIELD_CARD = `${FIELD_BASE} rounded-[10px]`;

// text-base (≥16px) avoids iOS Safari auto-zoom on focus; md:text-[15px] only applies at the dock breakpoint.
const EDITOR_BASE =
  "block w-full font-display text-base leading-[27px] md:text-[15px] text-parchment-900 caret-garnet-700 outline-none";
const EDITOR_PILL = `${EDITOR_BASE} px-3.5 py-[6px]`;
// background-attachment:local keeps the ruled lines tracking the text as it scrolls.
const EDITOR_CARD =
  `${EDITOR_BASE} rounded-[10px] px-3.5 pt-1 pb-3 overflow-y-auto [background-origin:content-box] [background-attachment:local] ` +
  "bg-[repeating-linear-gradient(to_bottom,transparent_0,transparent_26px,var(--color-parchment-100)_26px,var(--color-parchment-100)_27px)]";

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
  variant = "dock",
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
    // Omitting visibility means shared — the backend default — so only the PRIVATE opt-out is ever sent.
    const ok = await onSave(value.trim(), campaignId && isPrivate ? "PRIVATE" : undefined);
    if (ok) {
      setValue("");
      setIsPrivate(false);
      innerRef.current?.focus({ preventScroll: true });
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void handleSave();
    }
  }

  const field = (
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
  );

  const layout = { field, campaignId, isPrivate, setIsPrivate, canSave, error, onSave: handleSave };
  return variant === "mobile" ? (
    <MobileComposerLayout {...layout} />
  ) : (
    <DockComposerLayout {...layout} showHints={showHints} />
  );
}

interface ComposerLayoutProps {
  field: React.ReactNode;
  campaignId?: string | null;
  isPrivate: boolean;
  setIsPrivate: (checked: boolean) => void;
  canSave: boolean;
  error: string | null;
  onSave: () => void;
}

// items-end keeps the controls pinned to the composing line as the field grows upward.
function MobileComposerLayout({ field, campaignId, isPrivate, setIsPrivate, canSave, error, onSave }: ComposerLayoutProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-end gap-2">
        {campaignId && <PrivateLockButton checked={isPrivate} onChange={setIsPrivate} />}
        <div className="min-w-0 flex-1">{field}</div>
        <SendButton size="lg" disabled={!canSave} onClick={onSave} />
      </div>
      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}

function DockComposerLayout({
  field,
  campaignId,
  isPrivate,
  setIsPrivate,
  canSave,
  error,
  onSave,
  showHints,
}: ComposerLayoutProps & { showHints: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      {field}

      <div className="flex items-center gap-3">
        {campaignId && <PrivateToggle checked={isPrivate} onChange={setIsPrivate} label="Private" />}
        {showHints && <p className="text-[11.5px] text-parchment-400">↵ save · shift+↵ new line</p>}
        <SendButton size="sm" className="ml-auto" disabled={!canSave} onClick={onSave} />
      </div>

      {error && <p className="text-xs font-semibold text-garnet-700">{error}</p>}
    </div>
  );
}

// The mobile row uses the ≥44px touch-target minimum; the dock row a compact 36px control.
function SendButton({
  size,
  disabled,
  onClick,
  className = "",
}: {
  size: "sm" | "lg";
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  const dim = size === "lg" ? "h-11 w-11" : "h-9 w-9";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label="Save note"
      className={`flex ${dim} shrink-0 items-center justify-center rounded-full bg-garnet-surface text-garnet-on-surface transition-opacity hover:bg-garnet-surface-hover disabled:opacity-40 ${className}`}
    >
      <ArrowUp aria-hidden="true" className="h-4 w-4" strokeWidth={2.5} />
    </button>
  );
}
