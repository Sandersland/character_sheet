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
// backend normalizeForMatch (lib/journal-refs.ts) so search matches identically.
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
