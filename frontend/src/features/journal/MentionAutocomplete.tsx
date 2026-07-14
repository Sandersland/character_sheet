// A contenteditable wrapper that drives an @-tag autocomplete popover and shows
// each stored @[<uuid>] token as an atomic @Name chip while editing (#248, #269).
// Public contract is unchanged: `value` is the raw @[<uuid>] body string in,
// onChange(rawBody) out — the DOM is serialized back to tokens on every input so
// hosts and entity backlinks are unaffected. Editor/chip DOM wiring lives in
// useMentionEditor; the popover list is MentionSuggestionList (#609).

import { forwardRef, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "react-router-dom";

import MentionSuggestionList from "@/features/journal/MentionSuggestionList";
import { useMentionEditor } from "@/features/journal/useMentionEditor";
import { useIsBelowMd } from "@/hooks/useIsBelowMd";
import { useVisualViewportHeight } from "@/hooks/useVisualViewportHeight";

interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  campaignId?: string | null;
  rows?: number;
  className?: string;
  /** Extra inline styles merged onto the editor (e.g. a max-height cap). */
  style?: React.CSSProperties;
  placeholder?: string;
  id?: string;
  required?: boolean;
  /** Anchor the @-suggestion popover above the field vs. below (default). */
  popoverPlacement?: "above" | "below";
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

// Below md the suggestions render in-flow, capped to a share of the keyboard-aware
// viewport so they clear the on-screen keyboard (#785). The exception is an
// "above"-anchored field — the keyboard-docked composers (dock #865, mobile
// capture #866) sit flush above the keyboard, so a popover anchored above opens up
// into the visible feed (never clipped) and keeps the absolute popover on mobile.
function renderSuggestionsInFlow(isMobile: boolean, placement: "above" | "below"): boolean {
  return isMobile && placement !== "above";
}

const MentionAutocomplete = forwardRef<HTMLDivElement, MentionAutocompleteProps>(
  function MentionAutocomplete(
    { value, onChange, campaignId, rows = 2, className = "", style, placeholder, id, required, popoverPlacement = "below", onKeyDown, ...rest },
    forwardedRef,
  ) {
    const editor = useMentionEditor({ value, onChange, campaignId, onKeyDown });
    const { innerRef } = editor;
    const inFlow = renderSuggestionsInFlow(useIsBelowMd(), popoverPlacement);
    const viewportHeight = useVisualViewportHeight();
    const suggestionMaxHeight = Math.round(viewportHeight * 0.4);

    function setRef(el: HTMLDivElement | null) {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    }

    return (
      <div className="relative w-full min-w-0">
        <div
          ref={setRef}
          id={id}
          role="textbox"
          tabIndex={0}
          aria-multiline="true"
          aria-required={required}
          aria-label={rest["aria-label"]}
          aria-labelledby={rest["aria-labelledby"]}
          aria-controls={editor.listboxOpen ? editor.listboxId : undefined}
          aria-activedescendant={editor.activeOptionId}
          contentEditable
          suppressContentEditableWarning
          className={`whitespace-pre-wrap break-words ${className}`}
          style={{ minHeight: `${Math.max(rows, 1) * 1.6}em`, ...style }}
          onInput={editor.handleInput}
          onKeyUp={editor.handleKeyUp}
          onClick={editor.syncTrigger}
          onKeyDown={editor.handleKeyDown}
          onPaste={editor.handlePaste}
          onBlur={editor.handleBlur}
        />

        {placeholder && value === "" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 px-2.5 py-1.5 text-base md:text-sm text-parchment-400"
          >
            {placeholder}
          </span>
        )}

        {editor.popoverOpen && !campaignId && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-card border border-parchment-200 bg-parchment-50 p-3 text-xs text-parchment-700 shadow-raised">
            <Link to="/campaigns" className="font-semibold text-garnet-700 hover:underline">
              Create or join a campaign
            </Link>{" "}
            to tag people, places and things.
          </div>
        )}

        {editor.popoverOpen && campaignId && (
          <MentionSuggestionList
            campaignId={campaignId}
            listboxId={editor.listboxId}
            matches={editor.matches}
            byId={editor.byId}
            activeIndex={editor.activeIndex}
            showCreate={editor.showCreate}
            createName={editor.createName}
            createType={editor.createType}
            creating={editor.creating}
            optionId={editor.optionId}
            onSelect={editor.insertToken}
            onCreate={editor.handleCreate}
            onHover={editor.setActiveIndex}
            inFlow={inFlow}
            maxHeight={suggestionMaxHeight}
            placement={popoverPlacement}
          />
        )}

        {editor.error && (
          <p className="mt-1 text-xs font-semibold text-garnet-700">{editor.error}</p>
        )}
      </div>
    );
  },
);

export default MentionAutocomplete;
