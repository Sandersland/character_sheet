import type { CampaignEntity, EntityType } from "@/types/character";

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

// Resolve entity-type text through here — never by capitalizing the raw enum key.
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

// The -800 step is deliberate — the reversed dark ramp keeps light-on-dark text at WCAG AA (4.5:1) in both themes.
export const ENTITY_TYPE_INK_TEXT_CLASS: Record<EntityType, string> = {
  NPC: "text-garnet-800",
  LOCATION: "text-vitality-800",
  FACTION: "text-arcane-800",
  ITEM: "text-gold-800",
  PC: "text-garnet-800",
  OTHER: "text-parchment-800",
};

export const ENTITY_TYPE_INK_BORDER_CLASS: Record<EntityType, string> = {
  NPC: "border-garnet-800/45",
  LOCATION: "border-vitality-800/45",
  FACTION: "border-arcane-800/45",
  ITEM: "border-gold-800/45",
  PC: "border-garnet-800/45",
  OTHER: "border-parchment-800/45",
};

export const MENTION_INK_BASE_CLASS =
  "border-b border-dotted font-semibold [font-variant-caps:small-caps]";

const MENTION_TOKEN =
  /@\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

// Malformed tokens (failing the strict uuid pattern) stay as literal text.
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

// MUST stay in parity with the backend's normalizeForMatch — search must match identically.
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

// The @-autocomplete must keep using matchEntities — this variant also matches notes text, flagged as secondary (#840).
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

// The trigger buffer grows across spaces/apostrophes (multiword names) until a selection or deleting past `@`; an unrecognized `type:` prefix stays part of the query.
export function parseTrigger(textBeforeCaret: string): MentionTrigger | null {
  const at = textBeforeCaret.lastIndexOf("@");
  if (at === -1) return null;

  // Must start a word (start-of-text or after whitespace) so emails and mid-word `@`s don't trigger.
  const prev = at > 0 ? textBeforeCaret[at - 1] : "";
  if (prev && !/\s/.test(prev)) return null;

  const raw = textBeforeCaret.slice(at + 1);
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

export interface MentionResolved {
  name: string;
  type: EntityType;
}

// Mirrors ENTITY_TYPE_TONE and Badge's TONE_CLASSES — keep in sync.
export const MENTION_CHIP_TONE_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-50 text-garnet-800",
  LOCATION: "bg-vitality-50 text-vitality-800",
  FACTION: "bg-arcane-50 text-arcane-800",
  ITEM: "bg-gold-50 text-gold-800",
  PC: "bg-garnet-50 text-garnet-800",
  OTHER: "bg-parchment-100 text-parchment-700",
};

export const ENTITY_TYPE_DOT_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-500",
  LOCATION: "bg-vitality-500",
  FACTION: "bg-arcane-500",
  ITEM: "bg-gold-500",
  PC: "bg-garnet-500",
  OTHER: "bg-parchment-400",
};

export const ENTITY_TYPE_MONOGRAM_CLASS: Record<EntityType, string> = {
  NPC: "bg-garnet-50 text-garnet-700",
  LOCATION: "bg-vitality-50 text-vitality-800",
  FACTION: "bg-arcane-50 text-arcane-700",
  ITEM: "bg-gold-50 text-gold-800",
  PC: "bg-garnet-50 text-garnet-700",
  OTHER: "bg-parchment-100 text-parchment-600",
};

function buildMentionChip(id: string, name: string, type: EntityType): HTMLElement {
  const span = document.createElement("span");
  span.dataset.mentionId = id;
  span.setAttribute("contenteditable", "false");
  span.className = `inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium align-baseline ${MENTION_CHIP_TONE_CLASS[type]}`;
  span.textContent = `@${name}`;
  return span;
}

// Unknown ids render as literal @[<uuid>] text — matches MentionText's fallback.
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

// forward=false (backspace): the caret must sit right after the chip; forward=true (Delete): right before it.
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

interface SerializeState {
  out: string;
  started: boolean;
}

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

interface CaretWalkState {
  remaining: number;
  placed: boolean;
  started: boolean;
}

function landCaret(state: CaretWalkState, at: () => void): void {
  at();
  state.placed = true;
}

function consumeTextNode(node: Node, state: CaretWalkState, range: Range): void {
  const len = node.textContent?.length ?? 0;
  if (state.remaining <= len) landCaret(state, () => range.setStart(node, state.remaining));
  else {
    state.remaining -= len;
    state.started = true;
  }
}

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
  if ((el.tagName === "DIV" || el.tagName === "P") && state.started) state.remaining -= 1;
  return true;
}

function placeCaretInChild(child: Node, state: CaretWalkState, range: Range): boolean {
  if (child.nodeType === Node.TEXT_NODE) {
    consumeTextNode(child, state, range);
    return false;
  }
  if (child.nodeType !== Node.ELEMENT_NODE) return false;
  return consumeElement(child as HTMLElement, state, range);
}

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
