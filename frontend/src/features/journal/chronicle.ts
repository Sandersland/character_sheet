// Pure spine model for the field-chronicle page (#864). Turns the campaign's arcs
// ("parts") and its sessions ("chapters") plus this character's per-chapter note
// counts into the navigable spine the ChronicleSpine component renders. All display
// logic lives here (no JSX) so the bucketing / numbering / flattening rules are unit-
// testable in isolation:
//   • chapters = sessions (title, or "Session N" via the derived sessionNumber) +
//     a synthetic "Between sessions" chapter for sessionId-less entries.
//   • with arcs → PART headers (roman numeral by arc story order, session-number
//     range); sessions carry their arabic sessionNumber in the gold slot.
//   • with NO arcs (or a campaign-less character) → a flat chapter list, no headers.

import type { CampaignArc, ChronicleSession } from "@/types/character";

/** Stable id for the sessionless ("Between sessions") chapter. */
export const BETWEEN_CHAPTER_ID = "__between__";
/** Stable id for the pseudo-part holding sessions with no arc (when arcs exist). */
export const UNFILED_PART_ID = "__unfiled__";

export interface ChronicleChapter {
  /** Stable id: the session id, or BETWEEN_CHAPTER_ID for the sessionless bucket. */
  id: string;
  /** The session this chapter maps to, or null for the "Between sessions" bucket. */
  sessionId: string | null;
  title: string;
  /** Arabic session number for the gold slot; null for the between bucket. */
  sessionNumber: number | null;
  /** ISO session start, or null for the between bucket. */
  startedAt: string | null;
  noteCount: number;
  /** Participant character ids — drives the "may I rename this chapter?" check. */
  participantIds: string[];
}

export interface ChroniclePart {
  /** Arc id, or UNFILED_PART_ID for the no-arc pseudo-part. */
  id: string;
  /** Roman numeral by arc story order (position + 1); null for the unfiled part. */
  numeral: string | null;
  name: string;
  /** Session-number range within the part, e.g. "40–47" (en dash) or "12". */
  range: string;
  chapters: ChronicleChapter[];
}

export interface ChronicleSpine {
  /** false → flat chapter list, no part headers (no arcs / campaign-less). */
  hasParts: boolean;
  /** The sessionless "Between sessions" chapter, or null when there are none. */
  between: ChronicleChapter | null;
  /** Session chapters, newest-first — used when hasParts is false. */
  chapters: ChronicleChapter[];
  /** Parts, newest-first (part with the newest session on top) — hasParts only. */
  parts: ChroniclePart[];
  /** Total notes across every chapter incl. the between bucket (spine footer). */
  totalNotes: number;
  /** Number of session chapters (excludes the between bucket). */
  chapterCount: number;
}

export interface ChronicleInput {
  arcs: CampaignArc[];
  /** Sessions newest-first, as returned by fetchChronicleSessions. */
  sessions: ChronicleSession[];
  /** Per-session note counts (sessionId → count), computed from the local journal. */
  noteCountBySessionId: Map<string, number>;
  /** Note count of sessionId-less entries. */
  betweenNoteCount: number;
  /** Whether any sessionId-less entries exist (renders the between chapter). */
  hasSessionlessEntries: boolean;
}

const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

/** 1-based integer → roman numeral (parts stay small, but this is fully general). */
export function toRoman(value: number): string {
  if (!Number.isFinite(value) || value < 1) return String(value);
  let n = Math.floor(value);
  let out = "";
  for (const [amount, symbol] of ROMAN) {
    while (n >= amount) {
      out += symbol;
      n -= amount;
    }
  }
  return out;
}

function toChapter(session: ChronicleSession, noteCount: number): ChronicleChapter {
  const title = session.title?.trim() ? session.title.trim() : `Session ${session.sessionNumber}`;
  return {
    id: session.id,
    sessionId: session.id,
    title,
    sessionNumber: session.sessionNumber,
    startedAt: session.startedAt,
    noteCount,
    participantIds: session.participants?.map((p) => p.characterId) ?? [],
  };
}

// "40–47" (or a single "12") from a part's session numbers. Chapters arrive
// newest-first, so the head is the max and the tail the min.
function sessionRange(chapters: ChronicleChapter[]): string {
  const nums = chapters
    .map((c) => c.sessionNumber)
    .filter((n): n is number => n != null);
  if (nums.length === 0) return "";
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return min === max ? `${max}` : `${min}–${max}`;
}

// The sessionless bucket, or null when there are no sessionless entries.
function makeBetween(noteCount: number, present: boolean): ChronicleChapter | null {
  if (!present) return null;
  return {
    id: BETWEEN_CHAPTER_ID,
    sessionId: null,
    title: "Between sessions",
    sessionNumber: null,
    startedAt: null,
    noteCount,
    participantIds: [],
  };
}

// Bucket chapters by their (valid) arc; unknown/absent arcId → the unfiled bucket.
function bucketChaptersByArc(
  chapters: ChronicleChapter[],
  sessions: ChronicleSession[],
  arcById: Map<string, CampaignArc>,
): Map<string, ChronicleChapter[]> {
  const byArc = new Map<string, ChronicleChapter[]>();
  for (const chapter of chapters) {
    const session = sessions.find((s) => s.id === chapter.sessionId);
    const arcId = session?.arcId && arcById.has(session.arcId) ? session.arcId : UNFILED_PART_ID;
    const bucket = byArc.get(arcId) ?? [];
    bucket.push(chapter);
    byArc.set(arcId, bucket);
  }
  return byArc;
}

function toPart(arcId: string, chapters: ChronicleChapter[], arcById: Map<string, CampaignArc>): ChroniclePart {
  const arc = arcId === UNFILED_PART_ID ? null : arcById.get(arcId)!;
  return {
    id: arc ? arc.id : UNFILED_PART_ID,
    numeral: arc ? toRoman(arc.position + 1) : null,
    name: arc ? arc.name : "Unfiled sessions",
    range: sessionRange(chapters),
    chapters,
  };
}

// Highest session number in a part — the newest-session-first sort key (and -1
// for a part with no numbered sessions, so it sinks to the bottom).
function partSortKey(chapters: ChronicleChapter[]): number {
  const nums = chapters.map((c) => c.sessionNumber).filter((n): n is number => n != null);
  return nums.length ? Math.max(...nums) : -1;
}

// Parts newest-session-first (frame A′: Part III → II → I), unfiled sessions in
// their own pseudo-part.
function buildParts(
  arcs: CampaignArc[],
  chapters: ChronicleChapter[],
  sessions: ChronicleSession[],
): ChroniclePart[] {
  const arcById = new Map(arcs.map((a) => [a.id, a]));
  const byArc = bucketChaptersByArc(chapters, sessions, arcById);
  return [...byArc.entries()]
    .map(([arcId, arcChapters]) => ({ part: toPart(arcId, arcChapters, arcById), key: partSortKey(arcChapters) }))
    .sort((a, b) => b.key - a.key)
    .map((entry) => entry.part);
}

/**
 * Build the navigable spine. When `arcs` is empty the result is a flat chapter
 * list with `hasParts: false` (frame A); with arcs it's part-grouped (frame A′),
 * parts ordered newest-session-first, sessions with no arc collected into an
 * UNFILED pseudo-part.
 */
export function buildChronicleSpine(input: ChronicleInput): ChronicleSpine {
  const { arcs, sessions, noteCountBySessionId, betweenNoteCount, hasSessionlessEntries } = input;

  const chapters = sessions.map((s) => toChapter(s, noteCountBySessionId.get(s.id) ?? 0));
  const between = makeBetween(betweenNoteCount, hasSessionlessEntries);
  const totalNotes = chapters.reduce((sum, c) => sum + c.noteCount, 0) + (between?.noteCount ?? 0);
  const chapterCount = chapters.length;
  const parts = arcs.length > 0 ? buildParts(arcs, chapters, sessions) : [];

  return { hasParts: parts.length > 0, between, chapters, parts, totalNotes, chapterCount };
}

/** The default-selected chapter id: newest session, else the between bucket. */
export function defaultChapterId(spine: ChronicleSpine): string | null {
  if (spine.hasParts) {
    for (const part of spine.parts) {
      if (part.chapters.length > 0) return part.chapters[0].id;
    }
  } else if (spine.chapters.length > 0) {
    return spine.chapters[0].id;
  }
  return spine.between?.id ?? null;
}

/** Find a chapter anywhere in the spine (parts, flat list, or the between bucket). */
export function findChapter(spine: ChronicleSpine, chapterId: string | null): ChronicleChapter | null {
  if (!chapterId) return null;
  if (spine.between?.id === chapterId) return spine.between;
  const flat = spine.chapters.find((c) => c.id === chapterId);
  if (flat) return flat;
  for (const part of spine.parts) {
    const hit = part.chapters.find((c) => c.id === chapterId);
    if (hit) return hit;
  }
  return null;
}

/** The id of the part that contains a chapter (drives which part is expanded). */
export function partIdForChapter(spine: ChronicleSpine, chapterId: string | null): string | null {
  if (!chapterId) return null;
  for (const part of spine.parts) {
    if (part.chapters.some((c) => c.id === chapterId)) return part.id;
  }
  return null;
}

/**
 * Case-insensitive title filter for the spine's search box. Returns a spine of the
 * same shape with only chapters whose title matches; empty parts drop out, and the
 * between bucket survives only if its own title matches. A blank query is identity.
 */
export function filterSpine(spine: ChronicleSpine, query: string): ChronicleSpine {
  const q = query.trim().toLowerCase();
  if (q === "") return spine;
  const matches = (c: ChronicleChapter) => c.title.toLowerCase().includes(q);

  const chapters = spine.chapters.filter(matches);
  const between = spine.between && matches(spine.between) ? spine.between : null;
  const parts = spine.parts
    .map((part) => ({ ...part, chapters: part.chapters.filter(matches) }))
    .filter((part) => part.chapters.length > 0);

  const totalNotes =
    chapters.reduce((sum, c) => sum + c.noteCount, 0) +
    parts.reduce((sum, p) => sum + p.chapters.reduce((s, c) => s + c.noteCount, 0), 0) +
    (between?.noteCount ?? 0);
  const chapterCount =
    chapters.length + parts.reduce((sum, p) => sum + p.chapters.length, 0);

  return { hasParts: spine.hasParts, between, chapters, parts, totalNotes, chapterCount };
}
