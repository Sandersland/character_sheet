import type { CampaignArc, ChronicleSession } from "@/types/character";

export const BETWEEN_CHAPTER_ID = "__between__";
export const UNFILED_PART_ID = "__unfiled__";

export interface ChronicleChapter {
  id: string;
  sessionId: string | null;
  title: string;
  sessionNumber: number | null;
  startedAt: string | null;
  noteCount: number;
  participantIds: string[];
}

export interface ChroniclePart {
  id: string;
  numeral: string | null;
  name: string;
  range: string;
  chapters: ChronicleChapter[];
}

export interface ChronicleSpine {
  hasParts: boolean;
  between: ChronicleChapter | null;
  /** Session chapters, newest-first — used when hasParts is false. */
  chapters: ChronicleChapter[];
  /** Parts, newest-first (part with the newest session on top) — hasParts only. */
  parts: ChroniclePart[];
  totalNotes: number;
  chapterCount: number;
}

export interface ChronicleInput {
  arcs: CampaignArc[];
  /** Sessions newest-first, as returned by fetchChronicleSessions. */
  sessions: ChronicleSession[];
  noteCountBySessionId: Map<string, number>;
  betweenNoteCount: number;
  hasSessionlessEntries: boolean;
}

const ROMAN: Array<[number, string]> = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"],
  [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

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

function sessionRange(chapters: ChronicleChapter[]): string {
  const nums = chapters
    .map((c) => c.sessionNumber)
    .filter((n): n is number => n != null);
  if (nums.length === 0) return "";
  const max = Math.max(...nums);
  const min = Math.min(...nums);
  return min === max ? `${max}` : `${min}–${max}`;
}

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

function partSortKey(chapters: ChronicleChapter[]): number {
  const nums = chapters.map((c) => c.sessionNumber).filter((n): n is number => n != null);
  return nums.length ? Math.max(...nums) : -1;
}

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

export function buildChronicleSpine(input: ChronicleInput): ChronicleSpine {
  const { arcs, sessions, noteCountBySessionId, betweenNoteCount, hasSessionlessEntries } = input;

  const chapters = sessions.map((s) => toChapter(s, noteCountBySessionId.get(s.id) ?? 0));
  const between = makeBetween(betweenNoteCount, hasSessionlessEntries);
  const totalNotes = chapters.reduce((sum, c) => sum + c.noteCount, 0) + (between?.noteCount ?? 0);
  const chapterCount = chapters.length;
  const parts = arcs.length > 0 ? buildParts(arcs, chapters, sessions) : [];

  return { hasParts: parts.length > 0, between, chapters, parts, totalNotes, chapterCount };
}

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

export function partIdForChapter(spine: ChronicleSpine, chapterId: string | null): string | null {
  if (!chapterId) return null;
  for (const part of spine.parts) {
    if (part.chapters.some((c) => c.id === chapterId)) return part.id;
  }
  return null;
}

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
