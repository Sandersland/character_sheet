import { describe, it, expect } from "vitest";

import { effectPreview, isAttackCantrip, partyHealAllies, schoolLabel, upcastHint } from "@/lib/spellMeta";
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

  it("returns [] for a solo (null-campaign) session — no party to heal (#1082)", () => {
    const solo = { id: "s", campaignId: null, status: "active", startedAt: "x", participants: [] } as unknown as Session;
    expect(partyHealAllies(solo, "me")).toEqual([]);
  });
});

function previewSpell(overrides: Partial<Spell>): Spell {
  return {
    id: "s",
    name: "Spell",
    level: 1,
    school: "evocation",
    castingTime: "1 action",
    range: "60 feet",
    duration: "Instantaneous",
    description: "",
    ...overrides,
  } as Spell;
}

const previewFireball = previewSpell({
  name: "Fireball",
  level: 3,
  effectKind: "damage",
  damageType: "fire",
  effectRolls: [{ slotLevel: 5, roll: { count: 10, faces: 6, modifier: 0 } }],
});

const previewCantrip = previewSpell({
  name: "Fire Bolt",
  level: 0,
  effectKind: "damage",
  damageType: "fire",
  effectRolls: [{ slotLevel: 0, roll: { count: 2, faces: 10, modifier: 0 } }],
});

const previewHeal = previewSpell({
  name: "Cure Wounds",
  level: 1,
  effectKind: "heal",
  effectRolls: [{ slotLevel: 1, roll: { count: 2, faces: 8, modifier: 3 } }],
});

const previewUtility = previewSpell({ name: "Detect Magic", level: 1 });

const previewScorchingRay = previewSpell({
  name: "Scorching Ray",
  level: 2,
  effectKind: "damage",
  damageType: "fire",
  effectRolls: [{ slotLevel: 2, roll: { count: 2, faces: 6, modifier: 0 }, instanceCount: 3, instanceRoll: "each" }],
});

const previewEldritchBlastOneBeam = previewSpell({
  name: "Eldritch Blast",
  level: 0,
  effectKind: "damage",
  damageType: "force",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 }, instanceCount: 1, instanceRoll: "each" }],
});

describe("effectPreview — golden string snapshots (#1381)", () => {
  it("effectPreview strings", () => {
    expect(effectPreview(previewFireball, 5)).toBe("10d6 fire");
    expect(effectPreview(previewCantrip)).toBe("2d10 fire");
    expect(effectPreview(previewHeal)).toBe("2d8 + 3 healing");
    expect(effectPreview(previewUtility)).toBeNull();
  });

  it("the grimoire and the picker render the same heal string at the same slot (#1381)", () => {
    expect(effectPreview(previewHeal)).toBe("2d8 + 3 healing");
    expect(effectPreview(previewHeal, 1)).toBe(effectPreview(previewHeal));
  });

  it("prefixes a multi-instance roll with its instance count, not the combined dice (#1981/#1986)", () => {
    expect(effectPreview(previewScorchingRay, 2)).toBe("3 × 2d6 fire");
  });

  it("omits the instance prefix at instanceCount 1 — reads identically to an un-instanced roll (Eldritch Blast's base beam)", () => {
    expect(effectPreview(previewEldritchBlastOneBeam)).toBe("1d10 force");
  });
});

describe("upcastHint — multi-instance phrasing (#1981/#1984)", () => {
  it("returns null for a cantrip regardless of upcast fields", () => {
    expect(upcastHint({ level: 0, upcastDicePerLevel: 1, effectDiceFaces: 6, upcastInstancesPerLevel: undefined })).toBeNull();
  });

  it("keeps the plain dice-upcast phrasing when only upcastDicePerLevel is set (unaffected byte-identically)", () => {
    expect(upcastHint({ level: 3, upcastDicePerLevel: 1, effectDiceFaces: 6, upcastInstancesPerLevel: undefined }))
      .toBe("Upcast: +1d6 per slot level above 3");
  });

  it("renders instance-only upcast phrasing when only upcastInstancesPerLevel is set (Scorching Ray)", () => {
    expect(upcastHint({ level: 2, upcastDicePerLevel: undefined, effectDiceFaces: 6, upcastInstancesPerLevel: 1 }))
      .toBe("Upcast: +1 instance per slot level above 2");
  });

  it("pluralizes instance count when upcastInstancesPerLevel is greater than 1", () => {
    expect(upcastHint({ level: 1, upcastDicePerLevel: undefined, effectDiceFaces: 4, upcastInstancesPerLevel: 2 }))
      .toBe("Upcast: +2 instances per slot level above 1");
  });

  it("combines dice and instance upcast phrasing when a row sets both", () => {
    expect(upcastHint({ level: 1, upcastDicePerLevel: 1, effectDiceFaces: 4, upcastInstancesPerLevel: 1 }))
      .toBe("Upcast: +1d4 and +1 instance per slot level above 1");
  });

  it("returns null when neither upcast axis is set", () => {
    expect(upcastHint({ level: 1, upcastDicePerLevel: undefined, effectDiceFaces: 6, upcastInstancesPerLevel: undefined })).toBeNull();
  });
});
