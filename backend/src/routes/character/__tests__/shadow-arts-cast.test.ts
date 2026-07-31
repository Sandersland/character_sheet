/**
 * Warrior of Shadow cast endpoint (2024 rewrite, #1246 — formerly #441):
 * POST /abilities/shadow-arts/transactions. Real Postgres + supertest. Fixture is a
 * Warrior of Shadow monk whose XP sets the level. The single Shadow Arts
 * Darkness cast and the Cloak of Shadows activation are both exercised here.
 */

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { createApp } from "@/app.js";
import { Prisma } from "@/generated/prisma/client.js";
import { shadowArtEffectSpec, SHADOW_ART_CONCENTRATION_PREFIX } from "@/lib/classes/shadow-arts.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";
import { fighterResourceRowsData } from "@/test-support/fighter-resource-rows.js";

const OWNER_ID = "owner-shadow-cast";
let COOKIE: string;

const FIXTURE_ID = "test-shadow-cast-monk-1";
const CLASS_NAME = "Shadow Cast Test Monk";

// XP thresholds → monk level: L2=300, L3=900, L17=225000.
const XP_L2 = 300;
const XP_L3 = 900;
const XP_L17 = 225000;

const url = `/api/characters/${FIXTURE_ID}/abilities/shadow-arts/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "Shadow Cast Test Monk",
  alignment: "Neutral",
  initiativeBonus: 3,
  speed: 40,
  hitPoints: { current: 24, max: 24, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: {
    strength: 10, dexterity: 16, constitution: 12, intelligence: 10, wisdom: 15, charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: ["stealth"],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(createApp()).set("Cookie", COOKIE);
}
async function cast(operations: unknown[]) {
  return agent().post(url).send({ operations });
}

interface ActivityEvent {
  type: string;
  summary: string;
  data?: Record<string, unknown>;
  batchId?: string;
}
async function activity(): Promise<ActivityEvent[]> {
  const res = await agent().get(activityUrl);
  return res.body as ActivityEvent[];
}

let classId: string;
let darknessId: string; // concentration, utility, 1 focus

async function createMonk(experiencePoints: number, subclass: string | null) {
  // Link the subclass FK (#898) case-insensitively so granted spells resolve for a
  // "warrior of shadow" entry; a non-shadow name finds no row (subclassId stays null).
  const sub = subclass
    ? await prisma.subclass.findFirst({
        where: { classId, name: { equals: subclass, mode: "insensitive" } },
        select: { id: true },
      })
    : null;
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: {
        create: [{ name: "monk", subclass, subclassId: sub?.id, classId, position: 0 }],
      },
    },
  });
}

describe("Shadow Arts cast endpoint", () => {
  beforeAll(async () => {
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME },
      create: { name: CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    classId = cls.id;

    // Warrior of Shadow grants Minor Illusion at L3 as data (#898) — this is what gives
    // a pure (non-caster) Shadow monk a serialized spellcasting view at all, so the
    // cast Shadow Art's concentration can surface on it.
    const shadow = await upsertEditionRow(
      prisma.subclass,
      { classId, name: "Warrior of Shadow", edition: null },
      // Distinct from the real seeded "monk-warrior-of-shadow" (#1277) —
      // this test's Monk class is its own throwaway row.
      { classId, name: "Warrior of Shadow", description: "Test subclass", slug: "monk-warrior-of-shadow-cast-test" },
      {},
    );
    const minorIllusion = await prisma.spell.findUnique({ where: { name: "Minor Illusion" }, select: { id: true } });
    if (!minorIllusion) throw new Error("Minor Illusion not seeded — run `prisma db seed` before tests");
    await prisma.subclassGrantedSpell.upsert({
      where: { subclassId_spellId: { subclassId: shadow.id, spellId: minorIllusion.id } },
      create: { subclassId: shadow.id, spellId: minorIllusion.id, gateLevel: 3, castingAbility: "wisdom" },
      update: { gateLevel: 3, castingAbility: "wisdom" },
    });

    darknessId = (await prisma.grantedAbility.findFirst({ where: { name: "Shadow Arts: Darkness" } }))!.id;
  });

  afterAll(async () => {
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("casts Darkness for 1 focus and establishes concentration", async () => {
    await createMonk(XP_L3, "warrior of shadow");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(200);
    // The serialized character surfaces the Shadow Arts gate via availableActions (#1315).
    expect((res.body.availableActions as { key: string }[]).some((a) => a.key === "shadowArts")).toBe(true);
    const focus = res.body.resources.pools.find((p: { key: string }) => p.key === "focus");
    expect(focus.used).toBe(1);

    const events = await activity();
    const castEvent = events.find((e) => e.type === "castShadowArt")!;
    expect(castEvent).toBeDefined();
    expect(castEvent.data).toMatchObject({ shadowArtId: darknessId, focusSpent: 1 });
    expect(events.some((e) => e.type === "spendResource")).toBe(true);

    // A Shadow Art's concentration entryId is prefixed so its id space stays disjoint from Spell.id.
    const prefixedDarkness = `${SHADOW_ART_CONCENTRATION_PREFIX}${darknessId}`;
    expect(res.body.spellcasting.concentratingOn)
      .toMatchObject({ entryId: prefixedDarkness, spellName: "Shadow Arts: Darkness" });
  });

  // Byte-identical oracle for the shared focus-cast event tail (#642): pins the full
  // castShadowArt event payloads (before/after/summary/data) so the extraction of
  // snapshotSpellcasting + the event-emitting tail into a shared helper stays exact.
  it("pins the castShadowArt event payloads exactly (before/after/summary/data)", async () => {
    await createMonk(XP_L3, "warrior of shadow");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(200);
    const prefixedDarkness = `${SHADOW_ART_CONCENTRATION_PREFIX}${darknessId}`;

    // Concentration (spellcasting-category) event — carries the before/after snapshot.
    const concEvent = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, category: "spellcasting", type: "castShadowArt" },
    });
    expect(concEvent).not.toBeNull();
    expect(concEvent!.summary).toBe("Concentrating on Shadow Arts: Darkness");
    expect(concEvent!.before).toEqual({
      spellcasting: { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null },
    });
    expect(concEvent!.after).toEqual({
      spellcasting: {
        slotsUsed: {}, arcanumUsed: {}, spells: [],
        concentratingOn: { entryId: prefixedDarkness, spellName: "Shadow Arts: Darkness" },
      },
    });
    expect(concEvent!.data).toEqual({ shadowArtId: darknessId, shadowArtName: "Shadow Arts: Darkness" });

    // Cast record (resources-category) event — no snapshot, records the cast.
    const castEvent = await prisma.characterEvent.findFirst({
      where: { characterId: FIXTURE_ID, category: "resources", type: "castShadowArt" },
    });
    expect(castEvent).not.toBeNull();
    expect(castEvent!.before).toBeNull();
    expect(castEvent!.after).toBeNull();
    expect(castEvent!.data).toEqual({ shadowArtId: darknessId, focusSpent: 1 });
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged. Widens the #642 oracle above to the spendResource event.
  it("pins the audit trail of one Shadow Arts cast (incl. the focus spend)", async () => {
    await createMonk(XP_L3, "warrior of shadow");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(200);
    const noResourcesUsed = {
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [] },
    };
    const noSpellcasting = { slotsUsed: {}, arcanumUsed: {}, spells: [], concentratingOn: null };

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "resources",
        type: "castShadowArt",
        summary: "Cast Shadow Arts: Darkness (Spent 1 Focus Points — 2/3 remaining)",
        before: null,
        after: null,
        data: { shadowArtId: darknessId, focusSpent: 1 },
      },
      {
        category: "resources",
        type: "spendResource",
        summary: "Spent 1 Focus Points — 2/3 remaining",
        before: noResourcesUsed,
        after: { resources: { ...noResourcesUsed.resources, used: { focus: 1 } } },
        data: { key: "focus", amount: 1, remaining: 2, roll: null },
      },
      {
        category: "spellcasting",
        type: "castShadowArt",
        summary: "Concentrating on Shadow Arts: Darkness",
        before: { spellcasting: noSpellcasting },
        after: {
          spellcasting: {
            ...noSpellcasting,
            concentratingOn: {
              entryId: `${SHADOW_ART_CONCENTRATION_PREFIX}${darknessId}`,
              spellName: "Shadow Arts: Darkness",
            },
          },
        },
        data: { shadowArtId: darknessId, shadowArtName: "Shadow Arts: Darkness" },
      },
    ]);
  });

  it("logs an undoable cast: revert refunds focus and restores concentration to null", async () => {
    await createMonk(XP_L3, "warrior of shadow");
    const casted = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(casted.body.resources.pools.find((p: { key: string }) => p.key === "focus").used).toBe(1);

    const events = await activity();
    const batchId = events.find((e) => e.type === "castShadowArt")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(undo.body.resources.pools.find((p: { key: string }) => p.key === "focus").used).toBe(0);

    const reverted = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { spellcasting: true } });
    expect((reverted!.spellcasting as { concentratingOn: unknown }).concentratingOn).toBeNull();
  });

  it("rejects a Shadow Arts cast from a non-Shadow monk", async () => {
    await createMonk(XP_L3, "way of the four elements");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Warrior of Shadow/i);
  });

  it("rejects a Shadow Arts cast from a sub-L3 Shadow monk", async () => {
    await createMonk(XP_L2, "warrior of shadow");
    const res = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 3/i);
  });

  // #1315 shared-gate proof: the cast guard (shadow-arts.ts) and the wire
  // availableActions[] value both resolve through deriveEntryScopedActions —
  // never two independent copies of the level gate (CLAUDE.md's
  // level-gated-registry rule). If a future edit duplicated the gate (e.g. a
  // guard hardcoding a different threshold than the DERIVED_ACTIONS row), this
  // test would catch the resulting divergence at the exact boundary levels:
  // availableActions would say "available" while the guard still rejected, or
  // vice versa.
  it("shadowArts (L3) / cloakOfShadows (L17): availableActions[] presence and guard accept/reject move together at the boundary", async () => {
    await createMonk(XP_L2, "warrior of shadow");
    const l2 = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect((l2.body.availableActions as { key: string }[]).some((a) => a.key === "shadowArts")).toBe(false);
    const l2Cast = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(l2Cast.status).toBe(400);
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });

    await createMonk(XP_L3, "warrior of shadow");
    const l3 = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect((l3.body.availableActions as { key: string }[]).some((a) => a.key === "shadowArts")).toBe(true);
    expect((l3.body.availableActions as { key: string }[]).some((a) => a.key === "cloakOfShadows")).toBe(false);
    const l3Cast = await cast([{ type: "castShadowArt", shadowArtId: darknessId }]);
    expect(l3Cast.status).toBe(200);
    const l3CloakCast = await cast([{ type: "activateCloakOfShadows" }]);
    expect(l3CloakCast.status).toBe(400);
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });

    await createMonk(XP_L17, "warrior of shadow");
    const l17 = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect((l17.body.availableActions as { key: string }[]).some((a) => a.key === "cloakOfShadows")).toBe(true);
    const l17Cast = await cast([{ type: "activateCloakOfShadows" }]);
    expect(l17Cast.status).toBe(200);
  });

  // #1339: the subclass gate is an EXACT name match, so the 2014 "Way of Shadow"
  // monk (PHB'14 p.80) cannot reach the 2024 Warrior of Shadow features
  // (PHB'24 p.91). Asserted at BOTH layers — the wire availableActions[] and the
  // cast guard — because no test asserted either, which is how the substring
  // gate shipped past #1315.
  it('a 2014 "Way of Shadow" monk at L17 surfaces neither action and is rejected by both guards', async () => {
    await createMonk(XP_L17, "Way of Shadow");
    const sheet = await agent().get(`/api/characters/${FIXTURE_ID}`);
    const sheetKeys = (sheet.body.availableActions as { key: string }[]).map((a) => a.key);
    expect(sheetKeys).not.toContain("shadowArts");
    expect(sheetKeys).not.toContain("cloakOfShadows");
    expect(sheetKeys).not.toContain("shadowStep");
    expect((await cast([{ type: "castShadowArt", shadowArtId: darknessId }])).status).toBe(400);
    expect((await cast([{ type: "activateCloakOfShadows" }])).status).toBe(400);
  });

  describe("activateCloakOfShadows (L17)", () => {
    it("spends 3 focus and self-applies invisible", async () => {
      await createMonk(XP_L17, "warrior of shadow");
      const res = await cast([{ type: "activateCloakOfShadows" }]);
      expect(res.status).toBe(200);
      const focus = res.body.resources.pools.find((p: { key: string }) => p.key === "focus");
      expect(focus.used).toBe(3);
      expect(res.body.conditions.active).toContainEqual(
        expect.objectContaining({ key: "invisible", source: "Cloak of Shadows" }),
      );

      const events = await activity();
      expect(events.some((e) => e.type === "castShadowArt" && e.data?.focusSpent === 3)).toBe(true);
    });

    it("rejects activateCloakOfShadows below L17", async () => {
      await createMonk(XP_L3, "warrior of shadow");
      const res = await cast([{ type: "activateCloakOfShadows" }]);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/level 17/i);
    });

    it("reverts atomically: undo refunds focus and clears invisible together", async () => {
      await createMonk(XP_L17, "warrior of shadow");
      const activated = await cast([{ type: "activateCloakOfShadows" }]);
      expect(activated.body.resources.pools.find((p: { key: string }) => p.key === "focus").used).toBe(3);

      const events = await activity();
      const batchId = events.find((e) => e.type === "castShadowArt" && e.data?.focusSpent === 3)!.batchId!;
      const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
      expect(undo.status).toBe(200);
      expect(undo.body.resources.pools.find((p: { key: string }) => p.key === "focus").used).toBe(0);
      expect(undo.body.conditions.active).toEqual([]);
    });
  });
});

// #1315: availableActions is entry-scoped (mirrors deriveEntryScopedResources,
// #1206) — a secondary Warrior of Shadow monk's shadowArts/cloakOfShadows key
// off the MONK entry's own level, not the primary entry's class or the
// character's total level. Previously buildAvailableActionsView only ever
// read the PRIMARY entry at total level, so a secondary monk's gated actions
// never appeared regardless of level.
describe("GET availableActions — entry-scoped for multiclass (#1315)", () => {
  const MC2_ID = "test-shadow-mc-actions-1";
  const MC2_CLASS_NAME = "Shadow MC Actions Test Class";
  let mc2ClassId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: MC2_CLASS_NAME },
      create: { name: MC2_CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    mc2ClassId = cls.id;
    // Second Wind/Action Surge are row-driven now (#1528) and tied to a
    // specific classId — this fixture's fighter entry shares its classId with
    // the monk entry (both point at the same bespoke row), so seeding these
    // rows here covers the "PRIMARY Fighter's own actions still surface too"
    // assertion below.
    await prisma.classFeature.deleteMany({ where: { classId: mc2ClassId } });
    await prisma.classFeature.createMany({ data: fighterResourceRowsData(mc2ClassId) });
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: MC2_ID } });
    await prisma.characterClass.deleteMany({ where: { name: MC2_CLASS_NAME } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MC2_ID } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  // Fighter (primary) + Warrior of Shadow monk (secondary) at total level 8.
  async function createFighterMonkMC(monkLevel: number) {
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: MC2_ID,
        experiencePoints: 34000, // total level 8
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: {
          create: [
            { name: "fighter", subclass: null, classId: mc2ClassId, level: 8 - monkLevel, position: 0 },
            // classId: null (#1528) — this entry previously shared mc2ClassId
            // with the fighter entry above, which was harmless while
            // resourceFn dispatched by className string alone; now that
            // Second Wind/Action Surge are row-driven (classId-scoped
            // ClassFeature rows, keyed independent of entry.name), sharing
            // one classId across two logically-different class entries
            // makes BOTH entries see the fighter rows — an unsanctioned
            // "secondWind"/"actionSurge" pool-key collision 500s in
            // collectEntryScopedPools. Monk needs no classId here (its own
            // gates resolve off entry.name/subclass, never entry.classId).
            { name: "monk", subclass: "warrior of shadow", classId: null, level: monkLevel, position: 1 },
          ],
        },
      },
    });
  }

  it("a SECONDARY Warrior of Shadow monk (L3) surfaces shadowArts; the PRIMARY Fighter's own actions still surface too", async () => {
    await createFighterMonkMC(3);
    const res = await agent().get(`/api/characters/${MC2_ID}`);
    expect(res.status).toBe(200);
    const keys = (res.body.availableActions as { key: string }[]).map((a) => a.key);
    expect(keys).toContain("shadowArts");
    // cloakOfShadows needs monk entry level 17 — nowhere near reached at 3.
    expect(keys).not.toContain("cloakOfShadows");
    expect(keys).toContain("secondWind");
  });

  it("a SECONDARY monk below L3 does not surface shadowArts, even though total character level is 8", async () => {
    await createFighterMonkMC(2);
    const res = await agent().get(`/api/characters/${MC2_ID}`);
    expect(res.status).toBe(200);
    const keys = (res.body.availableActions as { key: string }[]).map((a) => a.key);
    expect(keys).not.toContain("shadowArts");
  });
});

// Concentration clamp-on-read: the shadow-art: prefix is what keeps a Shadow Art's
// concentration alive, NOT a blanket subclass-availability pass. A multiclass Warrior
// of Shadow monk who forgets the spellbook spell they were concentrating on must drop it.
describe("resolveConcentration clamp for multiclass Warrior of Shadow", () => {
  const MC_ID = "test-shadow-mc-stale-1";
  const MC_CLASS_NAME = "Shadow MC Test Class";
  let mcClassId: string;
  let mcDarknessId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: MC_CLASS_NAME },
      create: { name: MC_CLASS_NAME, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    mcClassId = cls.id;
    mcDarknessId = (await prisma.grantedAbility.findFirst({ where: { name: "Shadow Arts: Darkness" } }))!.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: MC_ID } });
    await prisma.characterClass.deleteMany({ where: { name: MC_CLASS_NAME } });
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: MC_ID } });
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  async function createMulticlass(spellcasting: unknown) {
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: MC_ID,
        experiencePoints: XP_L3,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        spellcasting: spellcasting as Prisma.InputJsonValue,
        classEntries: {
          create: [
            { name: "monk", subclass: "warrior of shadow", classId: mcClassId, level: 3, position: 0 },
            { name: "wizard", subclass: null, classId: mcClassId, level: 3, position: 1 },
          ],
        },
      },
    });
  }

  it("keeps a cast Shadow Art's prefixed concentration through serialization", async () => {
    await createMulticlass({
      slotsUsed: {}, arcanumUsed: {}, spells: [],
      concentratingOn: { entryId: `${SHADOW_ART_CONCENTRATION_PREFIX}${mcDarknessId}`, spellName: "Shadow Arts: Darkness" },
    });
    const res = await agent().get(`/api/characters/${MC_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.concentratingOn)
      .toMatchObject({ entryId: `${SHADOW_ART_CONCENTRATION_PREFIX}${mcDarknessId}`, spellName: "Shadow Arts: Darkness" });
  });

  it("drops a stale forgotten-spellbook-spell concentration (no blanket shadow-arts pass)", async () => {
    await createMulticlass({
      slotsUsed: {}, arcanumUsed: {}, spells: [],
      concentratingOn: { entryId: "stale-forgotten-spellbook-spell-id", spellName: "Hold Person" },
    });
    const res = await agent().get(`/api/characters/${MC_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.spellcasting.concentratingOn).toBeNull();
  });
});

// Unit + source-guard coverage.
describe("shadowArtEffectSpec", () => {
  it("builds a flat non-scaling utility spec that always concentrates for Darkness", () => {
    const spec = shadowArtEffectSpec({ name: "Shadow Arts: Darkness" });
    expect(spec.effectType).toBe("utility");
    expect(spec.scaling).toEqual({ mode: "none" });
    expect(spec.concentration).toBe(true);
    expect(spec.buffTarget).toBeNull();
  });

  it("still resolves the generic buff shape (shared catalogEffectSpec builder) for a hypothetical buff row", () => {
    // No current Shadow Art carries a buff (the 2014 Pass without Trace option
    // is retired, #1246) — this pins that the shared row→spec mapping still
    // works, since it's reused by Channel Divinity too.
    const spec = shadowArtEffectSpec({
      name: "Shadow Arts: Hypothetical Buff",
      effectKind: "buff",
      buffTarget: "stealth",
      buffModifier: 10,
    });
    expect(spec.effectType).toBe("buff");
    expect(spec.concentration).toBe(true);
    expect(spec.buffTarget).toBe("stealth");
    expect(spec.buffModifier).toBe(10);
  });
});

describe("Shadow Arts source guard", () => {
  const NON_SHADOW_NAME = "Test Non-Shadow GrantedAbility #441";
  const CLASS_NAME_2 = "Shadow Source Test Monk";
  const FIXTURE_ID_2 = "test-shadow-source-monk-1";
  let nonShadowId: string;
  let sourceClassId: string;

  beforeAll(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
    const cls = await prisma.characterClass.upsert({
      where: { name: CLASS_NAME_2 },
      create: { name: CLASS_NAME_2, hitDie: "d8", savingThrows: ["strength", "dexterity"], skillChoiceCount: 2, skillChoices: ["acrobatics", "stealth"], isSpellcaster: false },
      update: {},
    });
    sourceClassId = cls.id;
    const row = await upsertEditionRow(
      prisma.grantedAbility,
      { name: NON_SHADOW_NAME, edition: null },
      { name: NON_SHADOW_NAME, description: "A maneuver, not a Shadow Art.", source: "maneuver", minLevel: 3, costKind: "pool", costPoolKey: "focus", costBase: 2 },
      { source: "maneuver" },
    );
    nonShadowId = row.id;
  });

  afterAll(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID_2 } });
    await prisma.grantedAbility.deleteMany({ where: { name: NON_SHADOW_NAME } });
    await prisma.characterClass.deleteMany({ where: { name: CLASS_NAME_2 } });
  });

  it("excludes non-shadowArts rows from GET /api/shadow-arts", async () => {
    const res = await agent().get("/api/shadow-arts?edition=EDITION_2024");
    expect(res.status).toBe(200);
    expect((res.body as { id: string }[]).some((d) => d.id === nonShadowId)).toBe(false);
    expect((res.body as { name: string }[]).length).toBe(1);
  });

  // #1412: the read-side counterpart to the cast guard below. Own fixture,
  // deleted by NAME in the finally — this describe's afterAll can't clean up a
  // row it doesn't know about.
  it("(#1412) requires ?edition= and silently omits a 2014-tagged Shadow Art from a 2024 request", async () => {
    const FIXTURE_NAME = "XEd Shadow Art 2014 read";
    const row = await upsertEditionRow(
      prisma.grantedAbility,
      { name: FIXTURE_NAME, edition: "EDITION_2014" },
      {
        name: FIXTURE_NAME,
        source: "shadowArts",
        edition: "EDITION_2014",
        description: "Edition-filter test fixture.",
        costKind: "pool",
        costPoolKey: "focus",
        costBase: 1,
      },
      { source: "shadowArts" },
    );
    try {
      const bare = await agent().get("/api/shadow-arts");
      expect(bare.status).toBe(400);
      expect(bare.body.error).toBe("Missing required query parameter: edition");

      const unknown = await agent().get("/api/shadow-arts?edition=bogus");
      expect(unknown.status).toBe(400);
      expect(unknown.body.error).toMatch(/^Unknown edition: /);

      const as2024 = await agent().get("/api/shadow-arts?edition=EDITION_2024");
      expect(as2024.status).toBe(200);
      expect((as2024.body as { id: string }[]).some((a) => a.id === row.id)).toBe(false);
      // The NULL-edition seeded Darkness row still reaches both editions.
      expect((as2024.body as { name: string }[]).length).toBe(1);

      const as2014 = await agent().get("/api/shadow-arts?edition=EDITION_2014");
      expect(as2014.status).toBe(200);
      expect((as2014.body as { id: string }[]).some((a) => a.id === row.id)).toBe(true);
      expect((as2014.body as { name: string }[]).length).toBe(2);
    } finally {
      await prisma.grantedAbility.deleteMany({ where: { name: FIXTURE_NAME } });
    }
  });

  it("rejects castShadowArt against a non-shadowArts id", async () => {
    await prisma.character.create({
      data: {
        ...FIXTURE_BASE,
        id: FIXTURE_ID_2,
        experiencePoints: XP_L3,
        ownerId: OWNER_ID,
        resources: Prisma.JsonNull,
        classEntries: { create: [{ name: "monk", subclass: "warrior of shadow", classId: sourceClassId, position: 0 }] },
      },
    });
    const res = await agent()
      .post(`/api/characters/${FIXTURE_ID_2}/abilities/shadow-arts/transactions`)
      .send({ operations: [{ type: "castShadowArt", shadowArtId: nonShadowId }] });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in catalog/);
  });

  // #1345 (Chunk 5, plan audit — not named in the issue as filed): a
  // transient cast, not a permanent snapshot, but still a wrong-edition rule
  // applied to one cast and recorded in the audit event. Own fixture id (not
  // FIXTURE_ID_2) — the sibling test above creates FIXTURE_ID_2 with no
  // per-test cleanup (only this describe's afterAll clears it).
  const FIXTURE_ID_3 = "test-shadow-source-monk-1345";

  it("(#1345) rejects a 2014-tagged Shadow Art against the (default-2024) fixture", async () => {
    const row = await upsertEditionRow(
      prisma.grantedAbility,
      { name: "XEd Shadow Art 2014", edition: "EDITION_2014" },
      {
        name: "XEd Shadow Art 2014",
        source: "shadowArts",
        edition: "EDITION_2014",
        description: "Cross-edition guard test fixture.",
        costKind: "pool",
        costPoolKey: "focus",
        costBase: 1,
      },
      { source: "shadowArts" },
    );
    try {
      await prisma.character.create({
        data: {
          ...FIXTURE_BASE,
          id: FIXTURE_ID_3,
          experiencePoints: XP_L3,
          ownerId: OWNER_ID,
          resources: Prisma.JsonNull,
          classEntries: { create: [{ name: "monk", subclass: "warrior of shadow", classId: sourceClassId, position: 0 }] },
        },
      });
      const res = await agent()
        .post(`/api/characters/${FIXTURE_ID_3}/abilities/shadow-arts/transactions`)
        .send({ operations: [{ type: "castShadowArt", shadowArtId: row.id }] });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2014 rules/);
      expect(res.body.error).toMatch(/2024 rules/);
    } finally {
      await prisma.character.deleteMany({ where: { id: FIXTURE_ID_3 } });
      await prisma.grantedAbility.delete({ where: { id: row.id } });
    }
  });
});
