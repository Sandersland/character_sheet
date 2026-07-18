// Editor state + contentEditable/chip DOM wiring for MentionAutocomplete (#609).
// useMentionSuggest owns the @-trigger + suggestion model; useMentionEditor adds
// the editor ref, DOM-sync effect, and DOM-mutating handlers. The heavy branching
// lives in the module-level helpers below and in @/lib/mentions — the hooks are
// thin glue so neither trips the complexity gate.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { createEntity } from "@/api/client";
import { primeCampaignEntities, useCampaignEntities } from "@/hooks/useCampaignEntities";
import {
  matchEntities,
  mentionBodyToFragment,
  parseMentionBody,
  parseTrigger,
  placeCaretAtBodyOffset,
  resolveAdjacentChip,
  serializeMentionDom,
  serializeMentionDomBeforeCaret,
  spliceMentionToken,
  type MentionResolved,
  type MentionSegment,
  type MentionTrigger,
} from "@/lib/mentions";
import type { CampaignEntity, EntityType } from "@/types/character";

type ActiveTrigger = MentionTrigger & { caretOffset: number };
type Resolve = (id: string) => MentionResolved | null;

const MAX_MATCHES = 6;

// Keys handled on keydown for popover nav — keyup must not resync (which resets
// the active option), or aria-activedescendant can't track arrowing.
const NAV_KEYS = new Set(["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"]);

// Signature of the resolved names/types for the tokens in `value`; changes only
// when an entity loads or is renamed (so we re-render chips), not while typing.
function computeNamesKey(value: string, byId: Map<string, CampaignEntity>): string {
  return parseMentionBody(value)
    .filter((s): s is Extract<MentionSegment, { type: "mention" }> => s.type === "mention")
    .map((s) => {
      const id = s.id;
      const ent = byId.get(id);
      return `${id}:${ent?.name ?? ""}:${ent?.type ?? ""}`;
    })
    .join("|");
}

function computeMatches(
  trigger: ActiveTrigger | null,
  campaignId: string | null | undefined,
  entities: CampaignEntity[],
): CampaignEntity[] {
  if (!trigger || !campaignId) return [];
  // Never surface hidden entities in the tag picker, even to the owner (#534).
  const visible = entities.filter((e) => e.visibility !== "HIDDEN");
  const scoped = trigger.typeFilter ? visible.filter((e) => e.type === trigger.typeFilter) : visible;
  return matchEntities(scoped, trigger.query).slice(0, MAX_MATCHES);
}

// The create-row + popover open/close model derived from the live trigger.
function deriveSuggestState(
  trigger: ActiveTrigger | null,
  campaignId: string | null | undefined,
  matchCount: number,
) {
  const createName = trigger?.query.trim() ?? "";
  const showCreate = Boolean(campaignId && trigger && createName !== "");
  const createType: EntityType = trigger?.typeFilter ?? "NPC";
  const totalItems = matchCount + (showCreate ? 1 : 0);
  const popoverOpen = Boolean(trigger) && (campaignId ? totalItems > 0 : true);
  return { createName, showCreate, createType, totalItems, popoverOpen };
}

// Reflect `value` into the editor DOM only when the structure differs from
// what's typed or a name resolved — never mid-keystroke, so the caret holds.
function syncEditorDom(
  el: HTMLDivElement,
  value: string,
  namesKey: string,
  lastNamesKey: { current: string | null },
  resolve: Resolve,
) {
  if (serializeMentionDom(el) === value && namesKey === lastNamesKey.current) return;
  lastNamesKey.current = namesKey;
  el.replaceChildren(mentionBodyToFragment(value, resolve));
}

// Replace the in-progress @-query with `@[id] ` and pin the caret past it.
function insertMentionAt(
  el: HTMLDivElement,
  trigger: ActiveTrigger,
  entityId: string,
  resolve: Resolve,
  onChange: (v: string) => void,
  overlay?: MentionResolved,
) {
  const { body, caret } = spliceMentionToken(
    serializeMentionDom(el),
    trigger.triggerStart,
    trigger.caretOffset,
    entityId,
  );
  onChange(body);
  el.replaceChildren(
    mentionBodyToFragment(body, (lookup) => (overlay && lookup === entityId ? overlay : resolve(lookup))),
  );
  requestAnimationFrame(() => {
    el.focus();
    placeCaretAtBodyOffset(el, caret);
  });
}

// Remove the chip adjacent to a collapsed caret, pinning the caret at its start.
function removeAdjacentChip(
  el: HTMLDivElement,
  forward: boolean,
  onChange: (v: string) => void,
  afterRemove: () => void,
): boolean {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return false;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return false;
  const chip = resolveAdjacentChip(range, forward);
  if (!chip) return false;
  // Measure the chip's body offset, then pin the caret there after removal so it
  // lands deterministically across browsers instead of browser-default.
  const anchor = document.createRange();
  anchor.setStartBefore(chip);
  anchor.collapse(true);
  sel.removeAllRanges();
  sel.addRange(anchor);
  const chipStart = serializeMentionDomBeforeCaret(el).length;
  chip.remove();
  onChange(serializeMentionDom(el));
  afterRemove();
  // Defer past the value-driven re-render (which replaces the editor DOM) so the
  // caret pins to the chip-start offset instead of the browser default.
  requestAnimationFrame(() => {
    el.focus();
    placeCaretAtBodyOffset(el, chipStart);
  });
  return true;
}

interface NavContext {
  active: boolean;
  totalItems: number;
  setActiveIndex: (fn: (i: number) => number) => void;
  commit: () => void;
  close: () => void;
}

// Handle a popover-nav keydown; returns true when the key was consumed.
function runNavKey(event: ReactKeyboardEvent<HTMLDivElement>, ctx: NavContext): boolean {
  if (!ctx.active) return false;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      ctx.setActiveIndex((i) => (i + 1) % ctx.totalItems);
      return true;
    case "ArrowUp":
      event.preventDefault();
      ctx.setActiveIndex((i) => (i - 1 + ctx.totalItems) % ctx.totalItems);
      return true;
    case "Enter":
    case "Tab":
      event.preventDefault();
      ctx.commit();
      return true;
    case "Escape":
      event.preventDefault();
      event.stopPropagation();
      ctx.close();
      return true;
    default:
      return false;
  }
}

interface KeyDownContext extends NavContext {
  deleteChip: (forward: boolean) => boolean;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

function runEditorKeyDown(event: ReactKeyboardEvent<HTMLDivElement>, ctx: KeyDownContext) {
  if (runNavKey(event, ctx)) return;
  const del = event.key === "Delete";
  if ((event.key === "Backspace" || del) && ctx.deleteChip(del)) {
    event.preventDefault();
    return;
  }
  ctx.onKeyDown?.(event);
}

// Insert pasted text as plain text at the caret (contentEditable would otherwise
// paste rich HTML), then resync value + trigger through handleInput.
function applyPaste(event: React.ClipboardEvent<HTMLDivElement>, handleInput: () => void) {
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

// Create/error state + the createEntity side effect, isolated from the editor.
function useEntityCreation(campaignId: string | null | undefined, entities: CampaignEntity[]) {
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = useCallback(
    async (name: string, type: EntityType, onCreated: (e: CampaignEntity) => void) => {
      if (!campaignId || !name) return;
      setCreating(true);
      setError(null);
      try {
        const created = await createEntity(campaignId, { type, name });
        primeCampaignEntities(campaignId, [...entities, created]);
        onCreated(created);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create entity.");
      } finally {
        setCreating(false);
      }
    },
    [campaignId, entities],
  );
  return { creating, error, create };
}

// The @-trigger + suggestion model: what to show and the raw entity data.
function useMentionSuggest(campaignId: string | null | undefined, value: string) {
  const listboxId = useId();
  const { entities, byId } = useCampaignEntities(campaignId);
  const [trigger, setTrigger] = useState<ActiveTrigger | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const creation = useEntityCreation(campaignId, entities);

  const resolve = useCallback<Resolve>((id) => byId.get(id) ?? null, [byId]);
  const namesKey = useMemo(() => computeNamesKey(value, byId), [value, byId]);
  const matches = useMemo(
    () => computeMatches(trigger, campaignId, entities),
    [trigger, campaignId, entities],
  );
  const derived = deriveSuggestState(trigger, campaignId, matches.length);
  const listboxOpen = derived.popoverOpen && Boolean(campaignId);
  const optionId = useCallback((index: number) => `${listboxId}-opt-${index}`, [listboxId]);
  const activeOptionId = listboxOpen ? optionId(activeIndex) : undefined;

  return {
    entities,
    byId,
    resolve,
    namesKey,
    trigger,
    setTrigger,
    activeIndex,
    setActiveIndex,
    matches,
    listboxId,
    listboxOpen,
    optionId,
    activeOptionId,
    ...derived,
    ...creation,
  };
}

interface UseMentionEditorArgs {
  value: string;
  onChange: (value: string) => void;
  campaignId?: string | null;
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void;
}

type SuggestModel = ReturnType<typeof useMentionSuggest>;

function commitSuggestion(s: SuggestModel, insertToken: (id: string) => void, create: () => void) {
  if (s.activeIndex < s.matches.length) insertToken(s.matches[s.activeIndex].id);
  else if (s.showCreate) void create();
}

// Editor ref + every DOM-mutating handler, wired to the suggestion model.
function useMentionHandlers(
  innerRef: React.RefObject<HTMLDivElement | null>,
  s: SuggestModel,
  onChange: (v: string) => void,
  campaignId: string | null | undefined,
  onKeyDown?: (event: ReactKeyboardEvent<HTMLDivElement>) => void,
) {
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cancel the deferred blur-close on unmount so it never fires post-teardown.
  useEffect(() => () => void (blurTimer.current && clearTimeout(blurTimer.current)), []);

  const syncTrigger = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const before = serializeMentionDomBeforeCaret(el);
    const parsed = parseTrigger(before);
    s.setTrigger(parsed ? { ...parsed, caretOffset: before.length } : null);
    s.setActiveIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- captures only stable refs + setters; adding `s` would recreate this each render
  }, []);

  const handleInput = useCallback(() => {
    const el = innerRef.current;
    if (el) onChange(serializeMentionDom(el));
    syncTrigger();
  }, [innerRef, onChange, syncTrigger]);

  const insertToken = useCallback(
    (entityId: string, overlay?: MentionResolved) => {
      const el = innerRef.current;
      if (el && s.trigger) insertMentionAt(el, s.trigger, entityId, s.resolve, onChange, overlay);
      s.setTrigger(null);
    },
    [innerRef, s, onChange],
  );

  const handleCreate = useCallback(
    () => s.create(s.createName, s.createType, (c) => insertToken(c.id, { name: c.name, type: c.type })),
    [s, insertToken],
  );

  const commitActive = useCallback(
    () => commitSuggestion(s, insertToken, handleCreate),
    [s, insertToken, handleCreate],
  );

  const deleteAdjacentChip = useCallback(
    (forward: boolean) => {
      const el = innerRef.current;
      return el ? removeAdjacentChip(el, forward, onChange, syncTrigger) : false;
    },
    [innerRef, onChange, syncTrigger],
  );

  const handleKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) =>
      runEditorKeyDown(event, {
        active: s.popoverOpen && Boolean(campaignId) && s.totalItems > 0,
        totalItems: s.totalItems,
        setActiveIndex: s.setActiveIndex,
        commit: commitActive,
        close: () => s.setTrigger(null),
        deleteChip: deleteAdjacentChip,
        onKeyDown,
      }),
    [s, campaignId, commitActive, deleteAdjacentChip, onKeyDown],
  );

  const handlePaste = useCallback(
    (event: React.ClipboardEvent<HTMLDivElement>) => applyPaste(event, handleInput),
    [handleInput],
  );

  const handleKeyUp = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (!(s.popoverOpen && NAV_KEYS.has(event.key))) syncTrigger();
    },
    [s.popoverOpen, syncTrigger],
  );

  const handleBlur = useCallback(() => {
    if (blurTimer.current) clearTimeout(blurTimer.current);
    blurTimer.current = setTimeout(() => s.setTrigger(null), 120);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- captures only stable refs + setters; adding `s` would recreate this each render
  }, []);

  return {
    insertToken,
    handleCreate,
    handleInput,
    handleKeyDown,
    handleKeyUp,
    handlePaste,
    handleBlur,
    syncTrigger,
  };
}

export function useMentionEditor({ value, onChange, campaignId, onKeyDown }: UseMentionEditorArgs) {
  const innerRef = useRef<HTMLDivElement | null>(null);
  const s = useMentionSuggest(campaignId, value);
  const lastNamesKey = useRef<string | null>(null);
  const handlers = useMentionHandlers(innerRef, s, onChange, campaignId, onKeyDown);

  useEffect(() => {
    const el = innerRef.current;
    if (el) syncEditorDom(el, value, s.namesKey, lastNamesKey, s.resolve);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs are stable; s.resolve changes iff s.namesKey does (both track byId), so namesKey covers it
  }, [value, s.namesKey]);

  return {
    innerRef,
    byId: s.byId,
    listboxId: s.listboxId,
    listboxOpen: s.listboxOpen,
    popoverOpen: s.popoverOpen,
    activeOptionId: s.activeOptionId,
    matches: s.matches,
    activeIndex: s.activeIndex,
    setActiveIndex: s.setActiveIndex,
    showCreate: s.showCreate,
    createName: s.createName,
    createType: s.createType,
    creating: s.creating,
    error: s.error,
    optionId: s.optionId,
    ...handlers,
  };
}
