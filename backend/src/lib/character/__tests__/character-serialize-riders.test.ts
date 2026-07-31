// Rider contract (#1316): sneakAttack/stunningStrike/openHandTechnique/
// quiveringPalm/maneuvers are emitted ONLY when the character has them —
// absent keys off-class/subclass/level, never `null`. Headline case: a
// Battle Master Fighter's payload carries none of the monk/rogue keys.

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { QUIVERING_PALM_BUFF_KEY } from "@/lib/classes/quivering-palm.js";

const OWNER_ID = "owner-serialize-riders";
const CHAR_IDS = [
  "riders-battle-master-l7",
  "riders-rogue-l3",
  "riders-monk-l4",
  "riders-monk-l5",
  "riders-open-hand-l2",
  "riders-open-hand-l3",
  "riders-open-hand-l16",
  "riders-open-hand-l17",
  "riders-shadow-l17",
  "riders-open-handbook-l17",
  "riders-no-classes",
  "riders-rogue3-monk5",
];

async function serialize(characterId: string) {
  const row = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, include: characterInclude });
  return serializeCharacter(row);
}

const BASE = {
  ownerId: OWNER_ID,
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  savingThrowProficiencies: [] as string[],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
  hitPoints: { current: 10, max: 10, temp: 0, deathSaves: { successes: 0, failures: 0 } },
};

let fighterClassId: string;
let battleMasterSubclassId: string;

beforeAll(async () => {
  await ensureTestOwner(OWNER_ID);
  // #1546 Part B-ii: Battle Master's maneuverChoiceCount/maneuverSaveDC are
  // ROW-driven now (fighter.ts's deriveExtras is gone) — resolving them needs
  // the REAL FK relations (CharacterClassEntry.classId/subclassId), which this
  // fixture previously omitted entirely (harmless while Battle Master's
  // content was code, keyed only by the `subclass` NAME string). Points at the
  // real seeded catalog (read-only, never mutated — mirrors
  // maneuvers-multiclass.test.ts's identical pattern) rather than a bespoke
  // Subclass row, since this suite has no other reason to own its own class.
  fighterClassId = (await prisma.characterClass.findFirstOrThrow({ where: { name: "Fighter" } })).id;
  battleMasterSubclassId = (await prisma.subclass.findFirstOrThrow({ where: { classId: fighterClassId, name: "Battle Master" } })).id;
});

afterEach(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

afterAll(async () => {
  await prisma.character.deleteMany({ where: { id: { in: CHAR_IDS } } });
});

describe("serializeCharacter rider contract (#1316)", () => {
  it("a level-7 Battle Master Fighter carries no monk/rogue rider keys", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-battle-master-l7",
        name: "Battle Master Snapshot",
        experiencePoints: 23000, // level 7, proficiency +3
        hitDice: { total: 7, die: "d10", spent: 7 },
        abilityScores: { strength: 16, dexterity: 10, constitution: 14, intelligence: 10, wisdom: 10, charisma: 8 },
        classEntries: { create: [{ name: "fighter", position: 0, level: 7, subclass: "battle master", classId: fighterClassId, subclassId: battleMasterSubclassId }] },
      },
    });
    const payload = await serialize("riders-battle-master-l7");

    // The reproduction case: no null placeholders, no keys at all.
    expect(payload).not.toHaveProperty("sneakAttack");
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");

    // maneuverSaveDC folds into the same rider contract, at the top level,
    // named for the feature like every other rider (`maneuvers`, not
    // `maneuverSaveDC`) — Str 16 (+3) > Dex 10 (0), prof +3 → DC 14.
    expect(payload).toHaveProperty("maneuvers", { saveDC: 14 });
    // maneuverChoiceCount/toolProfChoiceCount stay put in resources (#1316) —
    // only the save DC moved out.
    expect((payload.resources as { maneuverChoiceCount?: number }).maneuverChoiceCount).toBe(5);
    expect(payload.resources).not.toHaveProperty("maneuverSaveDC");
  });

  it("a rogue's sneak-attack dice are still correct, with no other rider keys", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-rogue-l3",
        name: "Rogue Snapshot",
        experiencePoints: 900, // level 3, proficiency +2
        hitDice: { total: 3, die: "d8", spent: 3 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 10, charisma: 10 },
        classEntries: { create: [{ name: "rogue", position: 0, level: 3 }] },
      },
    });
    const payload = await serialize("riders-rogue-l3");

    expect(payload.sneakAttack).toEqual({ dice: { count: 2, faces: 6 } });
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("maneuvers");
  });

  it("a base monk below level 5 has no Stunning Strike (one below the gate)", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-monk-l4",
        name: "Monk L4 Snapshot",
        experiencePoints: 2700, // level 4
        hitDice: { total: 4, die: "d8", spent: 4 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 4 }] },
      },
    });
    const payload = await serialize("riders-monk-l4");
    expect(payload).not.toHaveProperty("stunningStrike");
  });

  it("a monk's Stunning Strike DC is correct exactly at the L5 gate", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-monk-l5",
        name: "Monk L5 Snapshot",
        experiencePoints: 6500, // level 5, proficiency +3
        hitDice: { total: 5, die: "d8", spent: 5 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 5 }] },
      },
    });
    const payload = await serialize("riders-monk-l5");

    // Wis 16 (+3), prof +3 → DC 14.
    expect(payload.stunningStrike).toEqual({ saveDC: 14 });
    // Not Open Hand — no Open Hand riders even though monk level is high enough.
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("sneakAttack");
  });

  it("an Open Hand monk one level below L3 has no Open Hand Technique", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l2",
        name: "Open Hand L2 Snapshot",
        experiencePoints: 300, // level 2
        hitDice: { total: 2, die: "d8", spent: 2 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 2, subclass: "Warrior of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-open-hand-l2");
    expect(payload).not.toHaveProperty("openHandTechnique");
  });

  it("an Open Hand monk's Open Hand Technique DC is correct exactly at the L3 gate (Stunning Strike still absent)", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l3",
        name: "Open Hand L3 Snapshot",
        experiencePoints: 900, // level 3, proficiency +2
        hitDice: { total: 3, die: "d8", spent: 3 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 3, subclass: "Warrior of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-open-hand-l3");

    // Wis 16 (+3), prof +2 → DC 13.
    expect(payload.openHandTechnique).toEqual({ saveDC: 13 });
    // Monk level 3 < 5 — Stunning Strike's own gate, unaffected by subclass.
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("quiveringPalm");
  });

  it("an Open Hand monk one level below L17 has no Quivering Palm", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l16",
        name: "Open Hand L16 Snapshot",
        experiencePoints: 195000, // level 16
        hitDice: { total: 16, die: "d8", spent: 16 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 16, subclass: "Warrior of the Open Hand" }] },
      },
    });
    const payload = await serialize("riders-open-hand-l16");
    expect(payload).not.toHaveProperty("quiveringPalm");
  });

  it("an Open Hand monk's Quivering Palm DC + active state are correct exactly at the L17 gate", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-hand-l17",
        name: "Open Hand L17 Snapshot",
        experiencePoints: 225000, // level 17, proficiency +6
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Warrior of the Open Hand" }] },
        activeEffects: {
          buffs: [
            { id: "buff-qp", key: QUIVERING_PALM_BUFF_KEY, target: QUIVERING_PALM_BUFF_KEY, modifier: 0, source: "Quivering Palm", duration: "while-active" },
          ],
        },
      },
    });
    const payload = await serialize("riders-open-hand-l17");

    // Wis 16 (+3), prof +6 → DC 17; vibrations are set → active true.
    expect(payload.quiveringPalm).toEqual({ saveDC: 17, active: true });
  });

  it("a level-17 monk of a different subclass has no Open Hand riders", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-shadow-l17",
        name: "Shadow L17 Snapshot",
        experiencePoints: 225000, // level 17
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Warrior of Shadow" }] },
      },
    });
    const payload = await serialize("riders-shadow-l17");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    // Base monk feature still gates purely on monk level, regardless of subclass.
    expect(payload.stunningStrike).toEqual({ saveDC: 17 });
  });

  // #1277: openHandMonkEntry used to substring-match ("open hand"), so a
  // homebrew name merely CONTAINING "Open Hand" incorrectly surfaced both
  // riders — the same failure class #1339 fixed at the DERIVED_ACTIONS gate.
  it('a level-17 monk named "Way of the Open Handbook" has neither Open Hand rider', async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-open-handbook-l17",
        name: "Open Handbook L17 Snapshot",
        experiencePoints: 225000, // level 17
        hitDice: { total: 17, die: "d8", spent: 17 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: { create: [{ name: "monk", position: 0, level: 17, subclass: "Way of the Open Handbook" }] },
      },
    });
    const payload = await serialize("riders-open-handbook-l17");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
  });

  it("a character with zero class entries carries no rider keys at all", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-no-classes",
        name: "Classless Snapshot",
        experiencePoints: 0,
        hitDice: { total: 0, die: "d8", spent: 0 },
        abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        classEntries: { create: [] },
      },
    });
    const payload = await serialize("riders-no-classes");

    expect(payload).not.toHaveProperty("sneakAttack");
    expect(payload).not.toHaveProperty("stunningStrike");
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("maneuvers");
  });

  it("a Rogue 3 / Monk 5 multiclass carries both riders, each gated on its own entry's level", async () => {
    await prisma.character.create({
      data: {
        ...BASE,
        id: "riders-rogue3-monk5",
        name: "Rogue3Monk5 Snapshot",
        experiencePoints: 34000, // level 8 (rogue 3 + monk 5), proficiency +3
        hitDice: { total: 8, die: "d8", spent: 8 },
        abilityScores: { strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 16, charisma: 10 },
        classEntries: {
          create: [
            { name: "rogue", position: 0, level: 3 },
            { name: "monk", position: 1, level: 5 },
          ],
        },
      },
    });
    const payload = await serialize("riders-rogue3-monk5");

    // Sneak Attack gates on the rogue entry's own level (3), not the total
    // character level (8) — same for Stunning Strike against the monk entry.
    expect(payload.sneakAttack).toEqual({ dice: { count: 2, faces: 6 } });
    // Wis 16 (+3), prof +3 (character level 8) → DC 14.
    expect(payload.stunningStrike).toEqual({ saveDC: 14 });
    expect(payload).not.toHaveProperty("openHandTechnique");
    expect(payload).not.toHaveProperty("quiveringPalm");
    expect(payload).not.toHaveProperty("maneuvers");
  });
});
