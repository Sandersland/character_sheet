import type { CampaignEntity, EntityType } from "@/types/character";

// @-tagging primitives (#248), all pure (no JSX, no DOM). The body of a note
// stores tags as the literal token `@[<uuid>]`; this module parses those for
// rendering, and parses the in-progress `@…` trigger for the autocomplete.

export type MentionSegment =
  | { type: "text"; value: string }
  | { type: "mention"; id: string };

const ENTITY_TYPES: readonly EntityType[] = [
  "NPC",
  "LOCATION",
  "FACTION",
  "ITEM",
  "PC",
  "OTHER",
];

// Display labels for the entity-type discriminator. Resolve type text through
// here, never by capitalizing the raw enum key.
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  NPC: "NPC",
  LOCATION: "Location",
  FACTION: "Faction",
  ITEM: "Item",
  PC: "PC",
  OTHER: "Other",
};

export const ENTITY_TYPE_OPTIONS: { value: EntityType; label: string }[] =
  ENTITY_TYPES.map((value) => ({ value, label: ENTITY_TYPE_LABELS[value] }));

// Badge tone per entity type — shared by the autocomplete popover and the
// rendered mention chips so a type reads the same colour everywhere.
export const ENTITY_TYPE_TONE: Record<
  EntityType,
  "garnet" | "arcane" | "gold" | "vitality" | "neutral"
> = {
  NPC: "garnet",
  LOCATION: "vitality",
  FACTION: "arcane",
  ITEM: "gold",
  PC: "garnet",
  OTHER: "neutral",
};

// Inked-name mention styling per entity type (#862). Mentions render as a
// scribe's inked name — small-caps, semibold, entity-colored text with a
// dotted underline at ~45% opacity of the ink — not a pill. The `-800` step is
// deliberate: the reversed dark ramp makes it light-on-dark, so both themes
// clear WCAG AA (4.5:1) as text. Shared by MentionText and the suggestion list
// so a type reads the same ink everywhere. Typed Record → new EntityTypes are a
// compile error (label-helper convention).
export const ENTITY_TYPE_INK_TEXT_CLASS: Record<EntityType, string> = {
  NPC: "text-garnet-800",
  LOCATION: "text-vitality-800",
  FACTION: "text-arcane-800",
  ITEM: "text-gold-800",
  PC: "text-garnet-800",
  OTHER: "text-parchment-800",
};

// Dotted-underline border color per type: the same ink at ~45% opacity.
export const ENTITY_TYPE_INK_BORDER_CLASS: Record<EntityType, string> = {
  NPC: "border-garnet-800/45",
  LOCATION: "border-vitality-800/45",
  FACTION: "border-arcane-800/45",
  ITEM: "border-gold-800/45",
  PC: "border-garnet-800/45",
  OTHER: "border-parchment-800/45",
};

// Presentation-agnostic ink recipe (no font-family — it inherits: serif in
// journal prose, sans elsewhere). Compose with the per-type text + border ink.
export const MENTION_INK_BASE_CLASS =
  "border-b border-dotted font-semibold [font-variant-caps:small-caps]";

const MENTION_TOKEN =
  /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

// Split a stored body into text + mention segments. Malformed tokens stay as
// literal text (they don't match the strict uuid pattern).
export function parseMentionBody(body: string): MentionSegment[] {
  const segments: MentionSegment[] = [];
  let lastIndex = 0;
  for (const match of body.matchAll(MENTION_TOKEN)) {
    const start = match.index ?? 0;
    if (start > lastIndex) {
      segments.push({ type: "text", value: body.slice(lastIndex, start) });
    }
    segments.push({ type: "mention", id: match[1].toLowerCase() });
    lastIndex = start + match[0].length;
  }
  if (lastIndex < body.length) {
    segments.push({ type: "text", value: body.slice(lastIndex) });
  }
  return segments;
}

// Fold a name/alias/query to a comparison key. MUST stay in parity with the
// backend normalizeForMatch (lib/activity/journal-refs.ts) so search matches identically.
export function normalizeForMatch(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Filter entities whose name or any alias contains the normalized query. An
// empty query returns the list unchanged.
export function matchEntities(
  entities: CampaignEntity[],
  query: string,
): CampaignEntity[] {
  const q = normalizeForMatch(query);
  if (!q) return entities;
  return entities.filter((e) =>
    [e.name, ...e.aliases].some((s) => normalizeForMatch(s).includes(q)),
  );
}

export interface EntityMatch {
  entity: CampaignEntity;
  matchedInNotesOnly: boolean;
}

// Codex-search variant of matchEntities (#840): name/alias hits stay primary,
// but notes text also matches, flagged so the UI can mark it as secondary.
// The @-autocomplete keeps using matchEntities — it must never match notes.
export function matchEntitiesDetailed(
  entities: CampaignEntity[],
  query: string,
): EntityMatch[] {
  const q = normalizeForMatch(query);
  if (!q) return entities.map((entity) => ({ entity, matchedInNotesOnly: false }));
  const matches: EntityMatch[] = [];
  for (const entity of entities) {
    if ([entity.name, ...entity.aliases].some((s) => normalizeForMatch(s).includes(q))) {
      matches.push({ entity, matchedInNotesOnly: false });
    } else if (entity.notes && normalizeForMatch(entity.notes).includes(q)) {
      matches.push({ entity, matchedInNotesOnly: true });
    }
  }
  return matches;
}

export interface MentionTrigger {
  active: true;
  typeFilter?: EntityType;
  query: string;
  triggerStart: number;
}

// Parse the in-progress `@…` trigger immediately left of the caret. Returns the
// active trigger or null. The buffer grows across spaces and apostrophes (a
// multiword name like "Baldur's Ga" keeps matching) — only a selection or
// deleting back past the `@` ends it. An optional reserved `type:` prefix (one
// of the EntityType set, case-insensitive) narrows the search; an unrecognized
// prefix is left as part of the query (so `@foo:bar` searches "foo:bar").
export function parseTrigger(textBeforeCaret: string): MentionTrigger | null {
  const at = textBeforeCaret.lastIndexOf("@");
  if (at === -1) return null;

  // The `@` must start a word (start-of-text or after whitespace) so emails and
  // mid-word `@`s don't trigger.
  const prev = at > 0 ? textBeforeCaret[at - 1] : "";
  if (prev && !/\s/.test(prev)) return null;

  const raw = textBeforeCaret.slice(at + 1);
  // An inserted token (`@[`) or a newline after the `@` is not a live trigger.
  if (raw.startsWith("[") || raw.includes("\n")) return null;

  const prefixMatch = /^([a-z]+):(.*)$/i.exec(raw);
  if (prefixMatch) {
    const candidate = prefixMatch[1].toUpperCase() as EntityType;
    if (ENTITY_TYPES.includes(candidate)) {
      return { active: true, typeFilter: candidate, query: prefixMatch[2], triggerStart: at };
    }
  }

  return { active: true, query: raw, triggerStart: at };
}

/** contenteditable DOM ⇄ @[<uuid>] string — the edit-time chip editor (#269). */
export interface MentionResolved {
  name: string;
  type: EntityType;
}

// Chip background/text per type — mirrors ENTITY_TYPE_TONE + Badge's TONE_CLASSES.
export const MENTION_CHIP_TONE_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-50 text-garnet-800",
  LOCATION: "bg-vitality-50 text-vitality-800",
  FACTION: "bg-arcane-50 text-arcane-800",
  ITEM: "bg-gold-50 text-gold-800",
  PC: "bg-garnet-50 text-garnet-800",
  OTHER: "bg-parchment-100 text-parchment-700",
};

// Filter-rail tone dot per type — same hue family as the chip/badge tones.
export const ENTITY_TYPE_DOT_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-500",
  LOCATION: "bg-vitality-500",
  FACTION: "bg-arcane-500",
  ITEM: "bg-gold-500",
  PC: "bg-garnet-500",
  OTHER: "bg-parchment-400",
};

// Ledger monogram tile tint per type — soft bg + accessible accent text.
export const ENTITY_TYPE_MONOGRAM_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-50 text-garnet-700",
  LOCATION: "bg-vitality-50 text-vitality-800",
  FACTION: "bg-arcane-50 text-arcane-700",
  ITEM: "bg-gold-50 text-gold-800",
  PC: "bg-garnet-50 text-garnet-700",
  OTHER: "bg-parchment-100 text-parchment-600",
};

// An atomic, non-editable @Name chip carrying its uuid in data-mention-id.
function buildMentionChip(id: string, name: string, type: EntityType): HTMLElement {
  const span = document.createElement("span");
  span.dataset.mentionId = id;
  span.setAttribute("contenteditable", "false");
  span.className = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-baseline ${MENTION_CHIP_TONE_CLASS[type]}`;
  span.textContent = `@${name}`;
  return span;
}

// Build editor DOM from a stored body: text → text nodes, known id → chip,
// unknown id → literal @[<uuid>] text (matches MentionText's fallback).
export function mentionBodyToFragment(
  body: string,
  resolve: (id: string) => MentionResolved | null,
): DocumentFragment {
  const frag = document.createDocumentFragment();
  for (const seg of parseMentionBody(body)) {
    if (seg.type === "text") {
      if (seg.value) frag.appendChild(document.createTextNode(seg.value));
      continue;
    }
    const ent = resolve(seg.id);
    frag.appendChild(
      ent ? buildMentionChip(seg.id, ent.name, ent.type) : document.createTextNode(`@[${seg.id}]`),
    );
  }
  return frag;
}

// Splice `@[<id>] ` into a body at the trigger, replacing the in-progress query.
// Returns the new body and the caret offset just past the inserted token+space.
export function spliceMentionToken(
  body: string,
  triggerStart: number,
  caretOffset: number,
  entityId: string,
): { body: string; caret: number } {
  const before = body.slice(0, triggerStart);
  const after = body.slice(caretOffset);
  const token = `@[${entityId}]`;
  return { body: `${before}${token} ${after}`, caret: before.length + token.length + 1 };
}

// Find the mention chip immediately adjacent to a collapsed caret, or null. For
// backspace (`forward=false`) the caret must sit at the end of the text before a
// chip (or on an element boundary just after it); for Delete the reverse.
export function resolveAdjacentChip(range: Range, forward: boolean): HTMLElement | null {
  const { startContainer: node, startOffset: offset } = range;
  let chip: Node | null;
  if (node.nodeType === Node.TEXT_NODE) {
    if (forward ? offset < (node.textContent?.length ?? 0) : offset > 0) return null;
    chip = forward ? node.nextSibling : node.previousSibling;
  } else {
    chip = node.childNodes[forward ? offset : offset - 1] ?? null;
  }
  if (!chip || chip.nodeType !== Node.ELEMENT_NODE || !(chip as HTMLElement).dataset.mentionId) {
    return null;
  }
  return chip as HTMLElement;
}

// Running state for the serialize walk: accumulated body + whether content started.
interface SerializeState {
  out: string;
  started: boolean;
}

// Serialize one element: chips emit their token; <br> and block elements (DIV/P)
// emit newlines (trailing placeholder <br>s drop); anything else recurses.
function serializeElement(el: HTMLElement, state: SerializeState, walk: (n: Node) => void): void {
  if (el.dataset.mentionId) {
    state.out += `@[${el.dataset.mentionId}]`;
    state.started = true;
    return;
  }
  if (el.tagName === "BR") {
    if (el.nextSibling) state.out += "\n";
    return;
  }
  if (el.tagName === "DIV" || el.tagName === "P") {
    if (state.started) state.out += "\n";
    walk(el);
    state.started = true;
    return;
  }
  walk(el);
}

// Walk editor DOM back into a @[<uuid>] body string.
export function serializeMentionDom(root: Node): string {
  const state: SerializeState = { out: "", started: false };
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        state.out += child.textContent ?? "";
        if (child.textContent) state.started = true;
        return;
      }
      if (child.nodeType === Node.ELEMENT_NODE) serializeElement(child as HTMLElement, state, walk);
    });
  };
  walk(root);
  return state.out;
}

// Serialize only the content left of the collapsed caret (for parseTrigger).
export function serializeMentionDomBeforeCaret(root: HTMLElement): string {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel || sel.rangeCount === 0 || !root.contains(sel.anchorNode)) {
    return serializeMentionDom(root);
  }
  const caret = sel.getRangeAt(0);
  const pre = document.createRange();
  pre.selectNodeContents(root);
  pre.setEnd(caret.endContainer, caret.endOffset);
  return serializeMentionDom(pre.cloneContents());
}

// Running state for the caret walk: how many body-string characters are left to
// skip before the caret lands, plus whether it has been placed and whether any
// content has been consumed yet (block elements only count a newline once inside).
interface CaretWalkState {
  remaining: number;
  placed: boolean;
  started: boolean;
}

// Runs `at()` to position the range, then marks the walk done.
function landCaret(state: CaretWalkState, at: () => void): void {
  at();
  state.placed = true;
}

// Consume a text node: land inside it if the offset falls here, else subtract
// its length and keep walking.
function consumeTextNode(node: Node, state: CaretWalkState, range: Range): void {
  const len = node.textContent?.length ?? 0;
  if (state.remaining <= len) landCaret(state, () => range.setStart(node, state.remaining));
  else {
    state.remaining -= len;
    state.started = true;
  }
}

// Consume an element node. Mention chips and <br> are caret boundaries; a block
// element only subtracts its implicit newline. Returns true to recurse into `el`.
function consumeElement(el: HTMLElement, state: CaretWalkState, range: Range): boolean {
  if (el.dataset.mentionId) {
    const len = `@[${el.dataset.mentionId}]`.length;
    if (state.remaining <= 0) landCaret(state, () => range.setStartBefore(el));
    else if (state.remaining <= len) landCaret(state, () => range.setStartAfter(el));
    else {
      state.remaining -= len;
      state.started = true;
    }
    return false;
  }
  if (el.tagName === "BR") {
    if (state.remaining <= 0) landCaret(state, () => range.setStartBefore(el));
    else {
      state.remaining -= 1;
      state.started = true;
    }
    return false;
  }
  // A block boundary counts as a single newline once content has started.
  if ((el.tagName === "DIV" || el.tagName === "P") && state.started) state.remaining -= 1;
  return true;
}

// Advances the caret walk across ONE child node, mutating `state` and setting
// `range` when the caret lands inside `child`. Returns true when the caller
// should recurse into `child` (a block/inline element that wasn't a boundary).
function placeCaretInChild(child: Node, state: CaretWalkState, range: Range): boolean {
  if (child.nodeType === Node.TEXT_NODE) {
    consumeTextNode(child, state, range);
    return false;
  }
  if (child.nodeType !== Node.ELEMENT_NODE) return false;
  return consumeElement(child as HTMLElement, state, range);
}

// Place the caret at a body-string offset (chips count as their token length).
export function placeCaretAtBodyOffset(root: HTMLElement, target: number): void {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel) return;
  const range = document.createRange();
  const state: CaretWalkState = { remaining: target, placed: false, started: false };
  const walk = (node: Node) => {
    for (let i = 0; i < node.childNodes.length && !state.placed; i += 1) {
      const child = node.childNodes[i];
      if (placeCaretInChild(child, state, range)) walk(child);
    }
  };
  walk(root);
  if (!state.placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
