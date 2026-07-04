// A contenteditable wrapper that drives an @-tag autocomplete popover and shows
// each stored @[<uuid>] token as an atomic @Name chip while editing (#248, #269).
// Public contract is unchanged: `value` is the raw @[<uuid>] body string in,
// onChange(rawBody) out — the DOM is serialized back to tokens on every input so
// hosts and entity backlinks are unaffected. Threads campaignId so a player not
// in a campaign gets a "create or join" CTA instead of matches.

import {
  forwardRef,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { Link } from "react-router-dom";

import { createEntity } from "@/api/client";
import Badge from "@/components/ui/Badge";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import {
  ENTITY_TYPE_LABELS,
  ENTITY_TYPE_TONE,
  matchEntities,
  mentionBodyToFragment,
  parseMentionBody,
  parseTrigger,
  placeCaretAtBodyOffset,
  serializeMentionDom,
  serializeMentionDomBeforeCaret,
  type MentionResolved,
  type MentionTrigger,
} from "@/lib/mentions";
import type { CampaignEntity, EntityType } from "@/types/character";

interface MentionAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  campaignId?: string | null;
  rows?: number;
  className?: string;
  placeholder?: string;
  id?: string;
  required?: boolean;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

type ActiveTrigger = MentionTrigger & { caretOffset: number };

const MAX_MATCHES = 6;

// Keys handled on keydown for popover nav — keyup must not resync (which resets
// the active option), or aria-activedescendant can't track arrowing.
const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);

const MentionAutocomplete = forwardRef<HTMLDivElement, MentionAutocompleteProps>(
  function MentionAutocomplete(
    { value, onChange, campaignId, rows = 2, className = "", placeholder, id, required, onKeyDown, ...rest },
    forwardedRef,
  ) {
    const innerRef = useRef<HTMLDivElement | null>(null);
    const listboxId = useId();
    const { entities, byId } = useCampaignEntities(campaignId);
    const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const ariaLabel = rest["aria-label"];
    const ariaLabelledBy = rest["aria-labelledby"];

    function setRef(el: HTMLDivElement | null) {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef) forwardedRef.current = el;
    }

    const resolve = (entityId: string): MentionResolved | null => byId.get(entityId) ?? null;

    // Signature of the resolved names/types for the tokens in `value`; changes
    // only when an entity loads or is renamed (so we re-render chips), not while
    // the user types plain text.
    const namesKey = useMemo(
      () =>
        parseMentionBody(value)
          .filter((s) => s.type === "mention")
          .map((s) => {
            const ent = byId.get((s as { id: string }).id);
            return `${(s as { id: string }).id}:${ent?.name ?? ""}:${ent?.type ?? ""}`;
          })
          .join("|"),
      [value, byId],
    );
    const lastNamesKey = useRef<string | null>(null);

    // The blur handler defers closing the popover by 120ms (so a click on an
    // option lands first). Track the pending timer so unmount can cancel it —
    // otherwise it fires after teardown and calls setState on an unmounted tree
    // ("window is not defined" under jsdom), which surfaced as a flaky test gate.
    const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
      () => () => {
        if (blurTimer.current) clearTimeout(blurTimer.current);
      },
      [],
    );

    // Reflect `value` into the editor DOM only when the structure differs from
    // what's typed or a name resolved — never mid-keystroke, so the caret holds.
    useEffect(() => {
      const el = innerRef.current;
      if (!el) return;
      if (serializeMentionDom(el) === value && namesKey === lastNamesKey.current) return;
      lastNamesKey.current = namesKey;
      el.replaceChildren(mentionBodyToFragment(value, resolve));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, namesKey]);

    function syncTrigger() {
      const el = innerRef.current;
      if (!el) return;
      const before = serializeMentionDomBeforeCaret(el);
      const parsed = parseTrigger(before);
      setTrigger(parsed ? { ...parsed, caretOffset: before.length } : null);
      setActiveIndex(0);
    }

    function handleInput() {
      const el = innerRef.current;
      if (!el) return;
      onChange(serializeMentionDom(el));
      syncTrigger();
    }

    const matches = (() => {
      if (!trigger || !campaignId) return [] as CampaignEntity[];
      const scoped = trigger.typeFilter
        ? entities.filter((e) => e.type === trigger.typeFilter)
        : entities;
      return matchEntities(scoped, trigger.query).slice(0, MAX_MATCHES);
    })();

    const createName = trigger?.query.trim() ?? "";
    const showCreate = Boolean(campaignId && trigger && createName !== "");
    const createType: EntityType = trigger?.typeFilter ?? "NPC";
    const totalItems = matches.length + (showCreate ? 1 : 0);
    const popoverOpen = Boolean(trigger) && (campaignId ? totalItems > 0 : true);
    const listboxOpen = popoverOpen && Boolean(campaignId);
    const optionId = (index: number) => `${listboxId}-opt-${index}`;
    const activeOptionId = listboxOpen ? optionId(activeIndex) : undefined;

    function insertToken(entityId: string, overlay?: MentionResolved) {
      const el = innerRef.current;
      if (!el || !trigger) return;
      const body = serializeMentionDom(el);
      const before = body.slice(0, trigger.triggerStart);
      const after = body.slice(trigger.caretOffset);
      const token = `@[${entityId}]`;
      const nextBody = `${before}${token} ${after}`;
      onChange(nextBody);
      el.replaceChildren(
        mentionBodyToFragment(nextBody, (lookup) =>
          overlay && lookup === entityId ? overlay : resolve(lookup),
        ),
      );
      setTrigger(null);
      const caret = before.length + token.length + 1;
      requestAnimationFrame(() => {
        el.focus();
        placeCaretAtBodyOffset(el, caret);
      });
    }

    async function handleCreate() {
      if (!campaignId || !createName) return;
      setCreating(true);
      setError(null);
      try {
        const created = await createEntity(campaignId, { type: createType, name: createName });
        primeCampaignEntities(campaignId, [...entities, created]);
        insertToken(created.id, { name: created.name, type: created.type });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create entity.");
      } finally {
        setCreating(false);
      }
    }

    function commitActive() {
      if (activeIndex < matches.length) insertToken(matches[activeIndex].id);
      else if (showCreate) void handleCreate();
    }

    // Backspace/Delete next to a chip removes it atomically.
    function deleteAdjacentChip(forward: boolean): boolean {
      const el = innerRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return false;
      const range = sel.getRangeAt(0);
      if (!range.collapsed) return false;
      const { startContainer: node, startOffset: offset } = range;
      let chip: Node | null = null;
      if (node.nodeType === Node.TEXT_NODE) {
        if (forward ? offset < (node.textContent?.length ?? 0) : offset > 0) return false;
        chip = forward ? node.nextSibling : node.previousSibling;
      } else {
        chip = node.childNodes[forward ? offset : offset - 1] ?? null;
      }
      if (!chip || chip.nodeType !== Node.ELEMENT_NODE || !(chip as HTMLElement).dataset.mentionId) {
        return false;
      }
      // Measure the chip's body offset, then pin the caret there after removal so
      // it lands deterministically across browsers instead of browser-default.
      const anchor = document.createRange();
      anchor.setStartBefore(chip);
      anchor.collapse(true);
      sel.removeAllRanges();
      sel.addRange(anchor);
      const chipStart = serializeMentionDomBeforeCaret(el).length;
      (chip as HTMLElement).remove();
      onChange(serializeMentionDom(el));
      syncTrigger();
      // Defer past the value-driven re-render (which replaces the editor DOM) so
      // the caret pins to the chip-start offset instead of the browser default.
      requestAnimationFrame(() => {
        el.focus();
        placeCaretAtBodyOffset(el, chipStart);
      });
      return true;
    }

    function handleKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
      if (popoverOpen && campaignId && totalItems > 0) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((i) => (i + 1) % totalItems);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex((i) => (i - 1 + totalItems) % totalItems);
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          commitActive();
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          setTrigger(null);
          return;
        }
      }
      if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentChip(event.key === "Delete")) {
        event.preventDefault();
        return;
      }
      onKeyDown?.(event);
    }

    function handlePaste(event: React.ClipboardEvent<HTMLDivElement>) {
      event.preventDefault();
      const text = event.clipboardData.getData("text/plain");
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      handleInput();
    }

    return (
      <div className="relative">
        <div
          ref={setRef}
          id={id}
          role="textbox"
          tabIndex={0}
          aria-multiline="true"
          aria-required={required}
          aria-label={ariaLabel}
          aria-labelledby={ariaLabelledBy}
          aria-controls={listboxOpen ? listboxId : undefined}
          aria-activedescendant={activeOptionId}
          contentEditable
          suppressContentEditableWarning
          className={`whitespace-pre-wrap break-words ${className}`}
          style={{ minHeight: `${Math.max(rows, 1) * 1.6}em` }}
          onInput={handleInput}
          onKeyUp={(e) => {
            if (popoverOpen && NAV_KEYS.has(e.key)) return;
            syncTrigger();
          }}
          onClick={syncTrigger}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onBlur={() => {
            if (blurTimer.current) clearTimeout(blurTimer.current);
            blurTimer.current = setTimeout(() => setTrigger(null), 120);
          }}
        />

        {placeholder && value === "" && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-0 top-0 px-2.5 py-1.5 text-sm text-parchment-400"
          >
            {placeholder}
          </span>
        )}

        {popoverOpen && !campaignId && (
          <div className="absolute left-0 right-0 top-full z-50 mt-1 rounded-card border border-parchment-200 bg-parchment-50 p-3 text-xs text-parchment-700 shadow-raised">
            <Link to="/campaigns" className="font-semibold text-garnet-700 hover:underline">
              Create or join a campaign
            </Link>{" "}
            to tag people, places and things.
          </div>
        )}

        {popoverOpen && campaignId && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Tag suggestions"
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-card border border-parchment-200 bg-parchment-50 py-1 shadow-raised"
          >
            {matches.map((entity, index) => (
              <li
                key={entity.id}
                id={optionId(index)}
                role="option"
                aria-selected={index === activeIndex}
                className={`flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm ${
                  index === activeIndex ? "bg-garnet-50 text-garnet-900" : "text-parchment-800"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertToken(entity.id);
                }}
                onMouseEnter={() => setActiveIndex(index)}
              >
                <span className="min-w-0 truncate">{entity.name}</span>
                <Badge tone={ENTITY_TYPE_TONE[entity.type]}>{ENTITY_TYPE_LABELS[entity.type]}</Badge>
              </li>
            ))}
            {showCreate && (
              <li
                id={optionId(matches.length)}
                role="option"
                aria-selected={activeIndex === matches.length}
                className={`flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm ${
                  activeIndex === matches.length ? "bg-garnet-50 text-garnet-900" : "text-parchment-700"
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  void handleCreate();
                }}
                onMouseEnter={() => setActiveIndex(matches.length)}
              >
                {creating ? "Creating…" : `➕ Create ${ENTITY_TYPE_LABELS[createType]} “${createName}”`}
              </li>
            )}
          </ul>
        )}

        {error && <p className="mt-1 text-xs font-semibold text-garnet-700">{error}</p>}
      </div>
    );
  },
);

export default MentionAutocomplete;
