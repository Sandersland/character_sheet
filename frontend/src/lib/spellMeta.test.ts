import { describe, it, expect } from "vitest";

import { isAttackCantrip, partyHealAllies, schoolLabel } from "@/lib/spellMeta";
import type { Session, Spell } from "@/types/character";

describe("schoolLabel", () => {
  it("title-cases a school key", () => {
    expect(schoolLabel("transmutation")).toBe("Transmutation");
    expect(schoolLabel("evocation")).toBe("Evocation");
  });
});

describe("isAttackCantrip (#734)", () => {
  const spell = (o: Partial<Spell>): Spell => ({ id: "s", name: "S", level: 0, ...o }) as Spell;

  it("is true for an attack-roll cantrip (Fire Bolt)", () => {
    expect(isAttackCantrip(spell({ level: 0, attackType: "attack" }))).toBe(true);
  });

  it("is false for a save cantrip (Sacred Flame)", () => {
    expect(isAttackCantrip(spell({ level: 0, attackType: "save" }))).toBe(false);
  });

  it("is false for a leveled attack spell", () => {
    expect(isAttackCantrip(spell({ level: 1, attackType: "attack" }))).toBe(false);
  });

  it("is false for a cantrip with no attack type", () => {
    expect(isAttackCantrip(spell({ level: 0 }))).toBe(false);
  });
});

function participant(
  characterId: string,
  name: string,
  optIn: boolean,
  opts: { leftAt?: string; campaignId?: string } = {},
) {
  return {
    id: `p-${characterId}`,
    sessionId: "sess-1",
    characterId,
    joinedAt: "2026-01-01T00:00:00Z",
    leftAt: opts.leftAt ?? null,
    character: {
      id: characterId,
      name,
      campaignPreferences: [
        { campaignId: opts.campaignId ?? "camp-1", autoFriendlyHealing: optIn },
      ],
    },
  };
}

function session(participants: ReturnType<typeof participant>[]): Session {
  return { id: "sess-1", campaignId: "camp-1", status: "active", startedAt: "x", participants } as unknown as Session;
}

describe("partyHealAllies", () => {
  it("lists opted-in allies, excluding self, sorted by name", () => {
    const s = session([
      participant("me", "Caster", true),
      participant("a2", "Zed", true),
      participant("a1", "Ana", true),
    ]);
    expect(partyHealAllies(s, "me")).toEqual([
      { characterId: "a1", name: "Ana" },
      { characterId: "a2", name: "Zed" },
    ]);
  });

  it("excludes allies who have not opted in", () => {
    const s = session([participant("a1", "Ana", false), participant("a2", "Zed", true)]);
    expect(partyHealAllies(s, "me")).toEqual([{ characterId: "a2", name: "Zed" }]);
  });

  it("excludes participants who have left the session", () => {
    const s = session([participant("a1", "Ana", true, { leftAt: "2026-01-02T00:00:00Z" })]);
    expect(partyHealAllies(s, "me")).toEqual([]);
  });

  it("excludes prefs from a different campaign", () => {
    const s = session([participant("a1", "Ana", true, { campaignId: "other-camp" })]);
    expect(partyHealAllies(s, "me")).toEqual([]);
  });

  it("returns an empty list when there are no participants", () => {
    expect(partyHealAllies({ id: "s", campaignId: "camp-1" } as unknown as Session, "me")).toEqual([]);
  });
});
