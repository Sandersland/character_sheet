import { describe, it, expect } from "vitest";

import type { CampaignArc, ChronicleSession } from "@/types/character";
import {
  BETWEEN_CHAPTER_ID,
  UNFILED_PART_ID,
  buildChronicleSpine,
  defaultChapterId,
  filterSpine,
  findChapter,
  partIdForChapter,
  toRoman,
  type ChronicleInput,
} from "@/features/journal/chronicle";

function session(overrides: Partial<ChronicleSession> & { id: string; sessionNumber: number }): ChronicleSession {
  return {
    campaignId: "camp",
    status: "ended",
    startedAt: `2026-07-${String(overrides.sessionNumber).padStart(2, "0")}T00:00:00.000Z`,
    title: null,
    arcId: null,
    noteCount: 0,
    ...overrides,
  };
}

// Sessions arrive newest-first from the API; mirror that in the fixtures.
function buildInput(over: Partial<ChronicleInput> = {}): ChronicleInput {
  return {
    arcs: [],
    sessions: [],
    noteCountBySessionId: new Map(),
    betweenNoteCount: 0,
    hasSessionlessEntries: false,
    ...over,
  };
}

describe("toRoman", () => {
  it("maps small integers used for part numerals", () => {
    expect(toRoman(1)).toBe("I");
    expect(toRoman(3)).toBe("III");
    expect(toRoman(4)).toBe("IV");
    expect(toRoman(9)).toBe("IX");
  });
});

describe("buildChronicleSpine — no arcs (flat)", () => {
  it("renders a flat chapter list with no part headers, newest-first", () => {
    const sessions = [
      session({ id: "s12", sessionNumber: 12, title: "The Sack of Greenest" }),
      session({ id: "s11", sessionNumber: 11 }),
      session({ id: "s10", sessionNumber: 10 }),
    ];
    const spine = buildChronicleSpine(
      buildInput({ sessions, noteCountBySessionId: new Map([["s12", 12], ["s11", 6], ["s10", 4]]) }),
    );

    expect(spine.hasParts).toBe(false);
    expect(spine.parts).toEqual([]);
    expect(spine.chapters.map((c) => c.id)).toEqual(["s12", "s11", "s10"]);
    // Title fallback uses the derived sessionNumber; explicit title kept.
    expect(spine.chapters[0].title).toBe("The Sack of Greenest");
    expect(spine.chapters[1].title).toBe("Session 11");
    // Arabic sessionNumber lands in the gold slot.
    expect(spine.chapters[0].sessionNumber).toBe(12);
    expect(spine.chapterCount).toBe(3);
    expect(spine.totalNotes).toBe(22);
  });
});

describe("buildChronicleSpine — between-sessions bucket", () => {
  it("adds a synthetic 'Between sessions' chapter for sessionless entries", () => {
    const spine = buildChronicleSpine(
      buildInput({ hasSessionlessEntries: true, betweenNoteCount: 3 }),
    );
    expect(spine.between).not.toBeNull();
    expect(spine.between?.id).toBe(BETWEEN_CHAPTER_ID);
    expect(spine.between?.title).toBe("Between sessions");
    expect(spine.between?.sessionNumber).toBeNull();
    expect(spine.between?.noteCount).toBe(3);
    expect(spine.totalNotes).toBe(3);
    // A campaign-less character (no sessions, no arcs) is the between bucket only.
    expect(spine.chapterCount).toBe(0);
    expect(spine.hasParts).toBe(false);
  });

  it("omits the between chapter when there are no sessionless entries", () => {
    const spine = buildChronicleSpine(buildInput());
    expect(spine.between).toBeNull();
  });
});

describe("buildChronicleSpine — with arcs (parts)", () => {
  const arcs: CampaignArc[] = [
    { id: "a1", campaignId: "camp", name: "Hoard of the Dragon Queen", position: 0, createdAt: "" },
    { id: "a2", campaignId: "camp", name: "The Cult of the Dragon", position: 1, createdAt: "" },
    { id: "a3", campaignId: "camp", name: "The Sunken Crypt", position: 2, createdAt: "" },
  ];
  const sessions = [
    session({ id: "s47", sessionNumber: 47, arcId: "a3", title: "The Vault Below" }),
    session({ id: "s46", sessionNumber: 46, arcId: "a3" }),
    session({ id: "s40", sessionNumber: 40, arcId: "a3" }),
    session({ id: "s39", sessionNumber: 39, arcId: "a2" }),
    session({ id: "s24", sessionNumber: 24, arcId: "a2" }),
    session({ id: "s23", sessionNumber: 23, arcId: "a1" }),
    session({ id: "s1", sessionNumber: 1, arcId: "a1" }),
  ];

  const spine = buildChronicleSpine(buildInput({ arcs, sessions }));

  it("groups sessions into parts, newest-session-first", () => {
    expect(spine.hasParts).toBe(true);
    expect(spine.parts.map((p) => p.id)).toEqual(["a3", "a2", "a1"]);
  });

  it("numbers parts by roman story order and shows a session range", () => {
    expect(spine.parts.map((p) => p.numeral)).toEqual(["III", "II", "I"]);
    expect(spine.parts[0].range).toBe("40–47");
    expect(spine.parts[1].range).toBe("24–39");
    expect(spine.parts[2].range).toBe("1–23");
    expect(spine.parts[0].name).toBe("The Sunken Crypt");
  });

  it("keeps sessions newest-first within a part with arabic gold-slot numbers", () => {
    expect(spine.parts[0].chapters.map((c) => c.sessionNumber)).toEqual([47, 46, 40]);
    expect(spine.parts[0].chapters[0].title).toBe("The Vault Below");
  });

  it("collects sessions with no (or unknown) arc into an unfiled part on top", () => {
    const withUnfiled = buildChronicleSpine(
      buildInput({
        arcs,
        sessions: [session({ id: "s48", sessionNumber: 48, arcId: null }), ...sessions],
      }),
    );
    expect(withUnfiled.parts[0].id).toBe(UNFILED_PART_ID);
    expect(withUnfiled.parts[0].numeral).toBeNull();
    expect(withUnfiled.parts[0].chapters.map((c) => c.id)).toEqual(["s48"]);
  });

  it("single-session part shows a bare number, not a range", () => {
    const one = buildChronicleSpine(
      buildInput({ arcs: [arcs[0]], sessions: [session({ id: "sX", sessionNumber: 5, arcId: "a1" })] }),
    );
    expect(one.parts[0].range).toBe("5");
  });
});

describe("defaultChapterId", () => {
  it("selects the newest session (flat)", () => {
    const spine = buildChronicleSpine(
      buildInput({ sessions: [session({ id: "s2", sessionNumber: 2 }), session({ id: "s1", sessionNumber: 1 })] }),
    );
    expect(defaultChapterId(spine)).toBe("s2");
  });

  it("selects the newest session in the leading part (with arcs)", () => {
    const arcs: CampaignArc[] = [{ id: "a1", campaignId: "camp", name: "One", position: 0, createdAt: "" }];
    const spine = buildChronicleSpine(
      buildInput({ arcs, sessions: [session({ id: "s2", sessionNumber: 2, arcId: "a1" })] }),
    );
    expect(defaultChapterId(spine)).toBe("s2");
  });

  it("falls back to the between bucket when there are no sessions", () => {
    const spine = buildChronicleSpine(buildInput({ hasSessionlessEntries: true, betweenNoteCount: 1 }));
    expect(defaultChapterId(spine)).toBe(BETWEEN_CHAPTER_ID);
  });
});

describe("findChapter / partIdForChapter", () => {
  const arcs: CampaignArc[] = [{ id: "a1", campaignId: "camp", name: "One", position: 0, createdAt: "" }];
  const spine = buildChronicleSpine(
    buildInput({
      arcs,
      sessions: [session({ id: "s2", sessionNumber: 2, arcId: "a1" })],
      hasSessionlessEntries: true,
      betweenNoteCount: 1,
    }),
  );

  it("finds chapters in parts and the between bucket", () => {
    expect(findChapter(spine, "s2")?.sessionId).toBe("s2");
    expect(findChapter(spine, BETWEEN_CHAPTER_ID)?.sessionId).toBeNull();
    expect(findChapter(spine, "missing")).toBeNull();
  });

  it("resolves the containing part for expansion", () => {
    expect(partIdForChapter(spine, "s2")).toBe("a1");
    expect(partIdForChapter(spine, BETWEEN_CHAPTER_ID)).toBeNull();
  });
});

describe("filterSpine", () => {
  const sessions = [
    session({ id: "s2", sessionNumber: 2, title: "The Vault Below" }),
    session({ id: "s1", sessionNumber: 1, title: "Leaving Neverwinter" }),
  ];
  const spine = buildChronicleSpine(buildInput({ sessions }));

  it("is identity for a blank query", () => {
    expect(filterSpine(spine, "  ")).toBe(spine);
  });

  it("matches chapter titles case-insensitively", () => {
    const filtered = filterSpine(spine, "vault");
    expect(filtered.chapters.map((c) => c.id)).toEqual(["s2"]);
    expect(filtered.chapterCount).toBe(1);
  });

  it("drops parts with no matching chapters", () => {
    const arcs: CampaignArc[] = [
      { id: "a1", campaignId: "camp", name: "One", position: 0, createdAt: "" },
      { id: "a2", campaignId: "camp", name: "Two", position: 1, createdAt: "" },
    ];
    const parted = buildChronicleSpine(
      buildInput({
        arcs,
        sessions: [
          session({ id: "s2", sessionNumber: 2, arcId: "a2", title: "The Vault Below" }),
          session({ id: "s1", sessionNumber: 1, arcId: "a1", title: "Leaving Neverwinter" }),
        ],
      }),
    );
    const filtered = filterSpine(parted, "vault");
    expect(filtered.parts).toHaveLength(1);
    expect(filtered.parts[0].id).toBe("a2");
  });
});
