import { describe, expect, it } from "vitest";

import { spellToResolution } from "@/lib/spellToResolution";
import type { Spell } from "@/types/character";

const STATS = { spellAttackBonus: 6, spellSaveDC: 14 };

const FIRE_BOLT: Spell = {
  id: "entry-fire-bolt",
  name: "Fire Bolt",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "attack",
  damageType: "fire",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 } }],
};

const SACRED_FLAME: Spell = {
  id: "entry-sacred-flame",
  name: "Sacred Flame",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "60 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "save",
  saveAbility: "dexterity",
  damageType: "radiant",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 8, modifier: 0 } }],
};

// Real served shape (#1981): per-dart dice (1d4+1), instanceCount/instanceRoll carried
// alongside — not the pre-#1981 combined-roll shape (3d4+3).
const MAGIC_MISSILE_2024: Spell = {
  id: "entry-magic-missile",
  name: "Magic Missile",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  effectKind: "damage",
  damageType: "force",
  castCost: "action",
  effectRolls: [
    { slotLevel: 1, roll: { count: 1, faces: 4, modifier: 1 }, instanceCount: 3, instanceRoll: "each" },
    { slotLevel: 2, roll: { count: 1, faces: 4, modifier: 1 }, instanceCount: 4, instanceRoll: "each" },
  ],
};

const MAGIC_MISSILE_2014: Spell = {
  ...MAGIC_MISSILE_2024,
  effectRolls: MAGIC_MISSILE_2024.effectRolls!.map((entry) => ({ ...entry, instanceRoll: "once" })),
};

const SCORCHING_RAY: Spell = {
  id: "entry-scorching-ray",
  name: "Scorching Ray",
  level: 2,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "attack",
  damageType: "fire",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [
    { slotLevel: 2, roll: { count: 2, faces: 6, modifier: 0 }, instanceCount: 3, instanceRoll: "each" },
    { slotLevel: 3, roll: { count: 2, faces: 6, modifier: 0 }, instanceCount: 4, instanceRoll: "each" },
  ],
};

// Cantrip-instanced shape (#1983 review) — Eldritch Blast's beam count scales with CHARACTER level
// (cantripLevel scaling), not slot level, so its one effectRolls entry always keys off slotLevel 0.
// Two separately-served fixtures (not one spell re-scaled client-side) stand in for what the backend
// serves a level-5-tier warlock (2 beams) vs a level-17 one (4 beams) — served shape only, no client math.
const ELDRITCH_BLAST_TIER1: Spell = {
  id: "entry-eldritch-blast",
  name: "Eldritch Blast",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "attack",
  damageType: "force",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 }, instanceCount: 1, instanceRoll: "each" }],
};

const ELDRITCH_BLAST_TIER2: Spell = {
  id: "entry-eldritch-blast",
  name: "Eldritch Blast",
  level: 0,
  school: "evocation",
  castingTime: "1 action",
  range: "120 feet",
  duration: "Instantaneous",
  description: "",
  attackType: "attack",
  damageType: "force",
  effectKind: "damage",
  castCost: "action",
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 }, instanceCount: 2, instanceRoll: "each" }],
};

const ELDRITCH_BLAST_TIER4: Spell = {
  ...ELDRITCH_BLAST_TIER2,
  effectRolls: [{ slotLevel: 0, roll: { count: 1, faces: 10, modifier: 0 }, instanceCount: 4, instanceRoll: "each" }],
};

const DRUIDCRAFT: Spell = {
  id: "entry-druidcraft",
  name: "Druidcraft",
  level: 0,
  school: "transmutation",
  castingTime: "1 action",
  range: "30 feet",
  duration: "Instantaneous",
  description: "",
  castCost: "action",
  effectRolls: [],
};

const CURE_WOUNDS: Spell = {
  id: "entry-cure-wounds",
  name: "Cure Wounds",
  level: 1,
  school: "evocation",
  castingTime: "1 action",
  range: "Touch",
  duration: "Instantaneous",
  description: "",
  effectKind: "heal",
  castCost: "action",
  effectRolls: [
    { slotLevel: 1, roll: { count: 1, faces: 8, modifier: 4 } },
    { slotLevel: 2, roll: { count: 2, faces: 8, modifier: 4 } },
  ],
};

const BLESS_BONUS: Spell = {
  id: "entry-bless",
  name: "Bless",
  level: 1,
  school: "enchantment",
  castingTime: "1 bonus action",
  range: "30 feet",
  duration: "Concentration, up to 1 minute",
  description: "",
  castCost: "bonusAction",
  effectRolls: [],
};

describe("spellToResolution", () => {
  it("attack-roll shape: toHit from the served spellAttackBonus, literal crit range 20 (#1120)", () => {
    const resolution = spellToResolution(FIRE_BOLT, 0, STATS);

    expect(resolution.source).toBe("Fire Bolt");
    expect(resolution.cost).toEqual({ kind: "action" });
    expect(resolution.toHit).toEqual({ bonus: 6, critRange: 20 });
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toMatchObject({
      spec: { count: 1, faces: 10, modifier: 0 },
      kind: "damage",
      damageType: "fire",
    });
  });

  it("saving-throw shape: save from the served spellSaveDC + the spell's own ability, no toHit", () => {
    const resolution = spellToResolution(SACRED_FLAME, 0, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toEqual({ dc: 14, ability: "dexterity" });
    expect(resolution.effect).toMatchObject({ kind: "damage", damageType: "radiant" });
  });

  it("auto-hit shape (Magic Missile): neither toHit nor save, effect only, at the chosen slot level", () => {
    const resolution = spellToResolution(MAGIC_MISSILE_2024, 2, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toMatchObject({
      spec: { count: 1, faces: 4, modifier: 1 },
      kind: "damage",
      damageType: "force",
    });
  });

  it("instances shape: copies the served instanceCount/instanceRoll verbatim for the chosen slot level (2024 'each')", () => {
    const resolution = spellToResolution(MAGIC_MISSILE_2024, 1, STATS);

    expect(resolution.instances).toEqual({ count: 3, roll: "each" });

    const upcast = spellToResolution(MAGIC_MISSILE_2024, 2, STATS);
    expect(upcast.instances).toEqual({ count: 4, roll: "each" });
  });

  it("instances shape: 2014 Magic Missile carries roll 'once' (Sage Advice: rolled once, applied to every dart)", () => {
    const resolution = spellToResolution(MAGIC_MISSILE_2014, 1, STATS);

    expect(resolution.instances).toEqual({ count: 3, roll: "once" });
  });

  it("instances shape: an attack-roll instanced spell (Scorching Ray) carries toHit AND instances together", () => {
    const resolution = spellToResolution(SCORCHING_RAY, 2, STATS);

    expect(resolution.toHit).toEqual({ bonus: 6, critRange: 20 });
    expect(resolution.instances).toEqual({ count: 3, roll: "each" });
    expect(resolution.effect).toMatchObject({ spec: { count: 2, faces: 6, modifier: 0 }, damageType: "fire" });
  });

  it("instances is absent for an un-instanced spell entry (Fire Bolt)", () => {
    const resolution = spellToResolution(FIRE_BOLT, 0, STATS);

    expect(resolution.instances).toBeUndefined();
  });

  it("cantrip-instanced shape (Eldritch Blast): a level-1-tier warlock's served entry still carries instances (count 1), not an un-instanced shape — the 1-beam base case (#1985)", () => {
    const resolution = spellToResolution(ELDRITCH_BLAST_TIER1, 0, STATS);

    expect(resolution.toHit).toEqual({ bonus: 6, critRange: 20 });
    expect(resolution.instances).toEqual({ count: 1, roll: "each" });
  });

  it("cantrip-instanced shape (Eldritch Blast): looks up the entry by slotLevel 0 and copies the served beam count verbatim — 2 beams at a level-5-tier character", () => {
    const resolution = spellToResolution(ELDRITCH_BLAST_TIER2, 0, STATS);

    expect(resolution.toHit).toEqual({ bonus: 6, critRange: 20 });
    expect(resolution.instances).toEqual({ count: 2, roll: "each" });
    expect(resolution.effect).toMatchObject({ spec: { count: 1, faces: 10, modifier: 0 }, damageType: "force" });
  });

  it("cantrip-instanced shape (Eldritch Blast): 4 beams at a level-17-tier character — a different served entry, never client-scaled from the level-5 one", () => {
    const resolution = spellToResolution(ELDRITCH_BLAST_TIER4, 0, STATS);

    expect(resolution.instances).toEqual({ count: 4, roll: "each" });
  });

  it("no-roll utility shape (Druidcraft): no toHit/save/effect at all", () => {
    const resolution = spellToResolution(DRUIDCRAFT, 0, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toBeUndefined();
  });

  it("heal shape: effect.kind is heal and damageType is omitted", () => {
    const resolution = spellToResolution(CURE_WOUNDS, 1, STATS);

    expect(resolution.effect).toMatchObject({ spec: { count: 1, faces: 8, modifier: 4 }, kind: "heal" });
    expect(resolution.effect).not.toHaveProperty("damageType");
  });

  it("resolves the upcast slot level's own served roll, never the base level's", () => {
    const resolution = spellToResolution(CURE_WOUNDS, 2, STATS);

    expect(resolution.effect).toMatchObject({ spec: { count: 2, faces: 8, modifier: 4 } });
  });

  it("maps a served bonus-action castCost to cost.kind bonusAction", () => {
    const resolution = spellToResolution(BLESS_BONUS, 1, STATS);

    expect(resolution.cost).toEqual({ kind: "bonusAction" });
  });

  it("defaults cost.kind to action when castCost is absent (legacy/no-cost spell)", () => {
    const noCastCost: Spell = { ...DRUIDCRAFT, castCost: undefined };

    expect(spellToResolution(noCastCost, 0, STATS).cost).toEqual({ kind: "action" });
  });

  it("a broken save spell (attackType save, no saveAbility) resolves to a bare no-roll shape — never a false auto-hit", () => {
    const brokenSaveSpell: Spell = { ...SACRED_FLAME, saveAbility: null };

    const resolution = spellToResolution(brokenSaveSpell, 0, STATS);

    expect(resolution.toHit).toBeUndefined();
    expect(resolution.save).toBeUndefined();
    expect(resolution.effect).toBeUndefined();
  });
});
