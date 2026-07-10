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

// --- contenteditable DOM ⇄ @[<uuid>] string (the edit-time chip editor, #269) ---

export interface MentionResolved {
  name: string;
  type: EntityType;
}

// Chip background/text per type — mirrors ENTITY_TYPE_TONE + Badge's TONE_CLASSES.
const MENTION_CHIP_TONE_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-50 text-garnet-800",
  LOCATION: "bg-vitality-50 text-vitality-800",
  FACTION: "bg-arcane-50 text-arcane-800",
  ITEM: "bg-gold-50 text-gold-800",
  PC: "bg-garnet-50 text-garnet-800",
  OTHER: "bg-parchment-100 text-parchment-700",
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

// Walk editor DOM back into a @[<uuid>] body string. Chips emit their token;
// <br> and block elements (DIV/P) emit newlines; trailing placeholder <br>s drop.
export function serializeMentionDom(root: Node): string {
  let out = "";
  let started = false;
  const walk = (node: Node) => {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        out += child.textContent ?? "";
        if (child.textContent) started = true;
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const el = child as HTMLElement;
      if (el.dataset.mentionId) {
        out += `@[${el.dataset.mentionId}]`;
        started = true;
        return;
      }
      if (el.tagName === "BR") {
        if (!child.nextSibling) return;
        out += "\n";
        return;
      }
      if (el.tagName === "DIV" || el.tagName === "P") {
        if (started) out += "\n";
        walk(el);
        started = true;
        return;
      }
      walk(el);
    });
  };
  walk(root);
  return out;
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

// Place the caret at a body-string offset (chips count as their token length).
export function placeCaretAtBodyOffset(root: HTMLElement, target: number): void {
  const sel = typeof window !== "undefined" ? window.getSelection() : null;
  if (!sel) return;
  const range = document.createRange();
  let remaining = target;
  let placed = false;
  let started = false;
  const walk = (node: Node) => {
    for (let i = 0; i < node.childNodes.length && !placed; i += 1) {
      const child = node.childNodes[i];
      if (child.nodeType === Node.TEXT_NODE) {
        const len = child.textContent?.length ?? 0;
        if (remaining <= len) {
          range.setStart(child, remaining);
          placed = true;
          return;
        }
        remaining -= len;
        started = true;
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) continue;
      const el = child as HTMLElement;
      if (el.dataset.mentionId) {
        const len = `@[${el.dataset.mentionId}]`.length;
        if (remaining <= 0) {
          range.setStartBefore(el);
          placed = true;
          return;
        }
        if (remaining <= len) {
          range.setStartAfter(el);
          placed = true;
          return;
        }
        remaining -= len;
        started = true;
        continue;
      }
      if (el.tagName === "BR") {
        if (remaining <= 0) {
          range.setStartBefore(el);
          placed = true;
          return;
        }
        remaining -= 1;
        started = true;
        continue;
      }
      if ((el.tagName === "DIV" || el.tagName === "P") && started) remaining -= 1;
      walk(el);
    }
  };
  walk(root);
  if (!placed) {
    range.selectNodeContents(root);
    range.collapse(false);
  } else {
    range.collapse(true);
  }
  sel.removeAllRanges();
  sel.addRange(range);
}
