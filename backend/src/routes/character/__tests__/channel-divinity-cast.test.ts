/**
 * Channel Divinity cast endpoint (#419): POST /abilities/channel-divinity/transactions and
 * GET /characters/:id/channel-divinity. Real Postgres + supertest. Most fixtures are
 * single-class clerics/paladins whose XP sets the level; CD options are read from
 * the seeded catalog by name. One multiclass fixture (#1340) proves the "spending
 * decrements the single shared pool" AC end-to-end: both classes' options draw on
 * ONE pool, not two.
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import supertest from "supertest";

import { app } from "@/test-support/app-server.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ensureTestOwner } from "@/test-support/owner.js";
import { readPinnedEvents } from "@/test-support/events.js";
import { authCookie } from "@/test-support/auth.js";
import { upsertEditionRow } from "@/lib/rules/catalog-edition.js";

const OWNER_ID = "owner-cd-cast";
let COOKIE: string;

const FIXTURE_ID = "test-cd-cast-1";

// XP thresholds → level: L2=300, L3=900, L6=14000, L10=64000.
const XP_L2 = 300;
const XP_L3 = 900;
const XP_L6 = 14000;
const XP_L10 = 64000;

const url = `/api/characters/${FIXTURE_ID}/abilities/channel-divinity/transactions`;
const activityUrl = `/api/characters/${FIXTURE_ID}/activity?category=resources`;

const FIXTURE_BASE = {
  id: FIXTURE_ID,
  name: "CD Test Character",
  alignment: "Neutral",
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 30, max: 30, temp: 0 },
  hitDice: { total: 3, die: "d8" },
  abilityScores: {
    strength: 12, dexterity: 12, constitution: 14, intelligence: 10, wisdom: 16, charisma: 16,
  },
  savingThrowProficiencies: ["wisdom", "charisma"],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

function agent() {
  return supertest.agent(app).set("Cookie", COOKIE);
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

const optionId: Record<string, string> = {};

// `edition: null` is load-bearing, not defensive: the #1412 test below forks
// "Channel Divinity: Turn Undead" into a same-name EDITION_2014 row, and a bare
// findFirst({ where: { name } }) would then be ambiguous — every cast test
// reading optionId would silently pick whichever row Postgres returned first.
async function loadOption(name: string) {
  optionId[name] = (await prisma.grantedAbility.findFirst({ where: { name, edition: null } }))!.id;
}

// #1225: classEntries.classId used to point at one shared test-only
// CharacterClass row regardless of the entry's own `name` — harmless while
// Cleric's Channel Divinity pool lived in lib/classes/cleric.ts's resourceFn
// (unaffected by the `class.features` relation), but NOT once Cleric's pool
// moved onto its ClassFeature rows: featureRowsOf reads `entry.class?.features`
// through classId, so a fake class with zero attached ClassFeature rows
// silently starved the Cleric side of its pool (a real cast 400'd). Resolves
// the REAL seeded CharacterClass per entry name instead — this suite only
// ever uses "cleric"/"paladin", both real seeded classes, so no synthetic
// scaffold class is needed anymore.
const classIdByName: Record<string, string> = {};
async function resolveClassId(name: string): Promise<string> {
  const cached = classIdByName[name];
  if (cached) return cached;
  const titleCase = name.charAt(0).toUpperCase() + name.slice(1);
  const cls = await prisma.characterClass.findUniqueOrThrow({ where: { name: titleCase } });
  classIdByName[name] = cls.id;
  return cls.id;
}

async function createCharacter(
  experiencePoints: number,
  className: string,
  subclass: string | null,
  rulesEdition?: "EDITION_2014" | "EDITION_2024",
) {
  const classId = await resolveClassId(className);
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      ...(rulesEdition ? { rulesEdition } : {}),
      classEntries: { create: [{ name: className, subclass, classId, position: 0 }] },
    },
  });
}

// Multiclass fixture (#1340): each entry resolves its OWN real classId (see
// resolveClassId's comment above) so both classes' row-driven pools/features
// load correctly, one per granting class, same shape as the single-class
// helper above but with two classEntries.
async function createMulticlass(
  experiencePoints: number,
  entries: { name: string; subclass: string | null; level: number }[],
) {
  const resolvedEntries = await Promise.all(
    entries.map(async (e, i) => ({ name: e.name, subclass: e.subclass, classId: await resolveClassId(e.name), position: i, level: e.level })),
  );
  await prisma.character.create({
    data: {
      ...FIXTURE_BASE,
      experiencePoints,
      ownerId: OWNER_ID,
      resources: Prisma.JsonNull,
      classEntries: { create: resolvedEntries },
    },
  });
}

function cdUsed(body: { resources: { pools: { key: string; used: number }[] } }): number {
  return body.resources.pools.find((p) => p.key === "channelDivinity")!.used;
}

describe("Channel Divinity cast endpoint", () => {
  beforeAll(async () => {
    await Promise.all([
      "Channel Divinity: Turn Undead",
      "Channel Divinity: Preserve Life",
      "Channel Divinity: Invoke Duplicity",
      "Channel Divinity: Sacred Weapon",
      "Channel Divinity: Cloak of Shadows",
      "Channel Divinity: Vow of Enmity",
      "Channel Divinity: Abjure Enemy",
    ].map(loadOption));
  });

  beforeEach(async () => {
    await ensureTestOwner(OWNER_ID);
    COOKIE = await authCookie(OWNER_ID);
  });

  afterEach(async () => {
    await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
  });

  it("Cleric L2 Turn Undead spends the CD pool, surfaces the DC, logs a history event", async () => {
    await createCharacter(XP_L2, "cleric", null);
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(res.status).toBe(200);
    expect(cdUsed(res.body)).toBe(1);

    const events = await activity();
    const cd = events.find((e) => e.type === "castChannelDivinity")!;
    expect(cd).toBeDefined();
    // Wisdom-based DC: 8 + prof(2) + wisMod(+3) = 13.
    expect(cd.data).toMatchObject({ abilityName: "Channel Divinity: Turn Undead", saveDc: 13, kind: "announce" });
    expect(cd.summary).toMatch(/DC 13/);
    expect(events.some((e) => e.type === "spendResource")).toBe(true);
  });

  // #1275 byte-identity oracle: captured on the per-feature URL before the move to
  // the shared ability endpoint, so a green run afterwards is evidence the audit
  // trail is unchanged.
  it("pins the audit trail of one Turn Undead channel", async () => {
    await createCharacter(XP_L2, "cleric", null);
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(res.status).toBe(200);

    const noResourcesUsed = {
      resources: { used: {}, maneuversKnown: [], toolProficienciesKnown: [], choicesKnown: {}, advancements: [] },
    };

    expect(await readPinnedEvents(FIXTURE_ID)).toEqual([
      {
        category: "resources",
        type: "castChannelDivinity",
        summary: "Channeled Turn Undead (DC 13)",
        before: null,
        after: null,
        data: {
          abilityId: optionId["Channel Divinity: Turn Undead"],
          abilityName: "Channel Divinity: Turn Undead",
          kind: "announce",
          saveAbility: "wisdom",
          saveDc: 13,
          reminder: "Targets make a wisdom save (DC 13) or are turned/affected for 1 minute.",
        },
      },
      {
        category: "resources",
        type: "spendResource",
        // #1225: a level-2 2024 Cleric's pool is 2, not 1 (SRD 5.2's own
        // progression) — one spend leaves 1/2, not 0/1.
        summary: "Spent 1 Channel Divinity — 1/2 remaining",
        before: noResourcesUsed,
        after: { resources: { ...noResourcesUsed.resources, used: { channelDivinity: 1 } } },
        data: { key: "channelDivinity", amount: 1, remaining: 1, roll: null },
      },
    ]);
  });

  it("Paladin Devotion Sacred Weapon applies a real attackRoll buff (max(1,Cha) = +3) and revert clears it", async () => {
    await createCharacter(XP_L3, "paladin", "oath of devotion");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Sacred Weapon"] }]);
    expect(res.status).toBe(200);

    const withBuff = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
    const buffs = (withBuff!.activeEffects as { buffs: { target: string; modifier: number; duration: string }[] }).buffs;
    expect(buffs).toContainEqual(expect.objectContaining({ target: "attackRoll", modifier: 3, duration: "while-active" }));

    // Undo the batch → CD refunded + buff cleared (create/cleanup symmetry).
    const batchId = (await activity()).find((e) => e.type === "castChannelDivinity")!.batchId!;
    const undo = await agent().post(`/api/characters/${FIXTURE_ID}/events/${batchId}/revert`);
    expect(undo.status).toBe(200);
    expect(cdUsed(undo.body)).toBe(0);
    const cleared = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { activeEffects: true } });
    expect((cleared!.activeEffects as { buffs: unknown[] }).buffs.length).toBe(0);
  });

  it("Trickery Cloak of Shadows (L6) self-applies the invisible condition", async () => {
    await createCharacter(XP_L6, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Cloak of Shadows"] }]);
    expect(res.status).toBe(200);
    const row = await prisma.character.findUnique({ where: { id: FIXTURE_ID }, select: { conditions: true } });
    const active = (row!.conditions as { active: { key: string }[] }).active;
    expect(active.some((c) => c.key === "invisible")).toBe(true);
  });

  it("Vengeance Vow of Enmity records advantage roll-mode in the event data", async () => {
    await createCharacter(XP_L3, "paladin", "oath of vengeance");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Vow of Enmity"] }]);
    expect(res.status).toBe(200);
    const cd = (await activity()).find((e) => e.type === "castChannelDivinity")!;
    expect(cd.data).toMatchObject({ kind: "advantage", rollMode: "advantage" });
    expect(cd.data!.reminder).toMatch(/advantage/i);
  });

  it("Life Domain Preserve Life carries the derived HP pool (5× level) in its reminder", async () => {
    await createCharacter(XP_L3, "cleric", "life domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Preserve Life"] }]);
    expect(res.status).toBe(200);
    const cd = (await activity()).find((e) => e.type === "castChannelDivinity")!;
    // Level 3 (first grant level, #1128) → 15 HP pool.
    expect(cd.data!.reminder).toMatch(/15 HP/);
  });

  it("Trickery Invoke Duplicity is available at its level-3 grant", async () => {
    await createCharacter(XP_L3, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Invoke Duplicity"] }]);
    expect(res.status).toBe(200);
    const cd = (await activity()).find((e) => e.type === "castChannelDivinity")!;
    expect(cd.data!.reminder).toMatch(/duplicate/i);
  });

  it("rejects Preserve Life at level 2 (2024 grant is 3, #1128)", async () => {
    await createCharacter(XP_L2, "cleric", "life domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Preserve Life"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 3/);
  });

  it("rejects Invoke Duplicity at level 2 (2024 grant is 3, #1128)", async () => {
    await createCharacter(XP_L2, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Invoke Duplicity"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 3/);
  });

  // ── Gating (the non-happy paths) ────────────────────────────────────────────

  it("rejects a domain option the cleric's subclass doesn't grant", async () => {
    await createCharacter(XP_L3, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Preserve Life"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/life domain/i);
  });

  it("rejects an oath option below the granting level (Cloak of Shadows needs L6)", async () => {
    await createCharacter(XP_L3, "cleric", "trickery domain");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Cloak of Shadows"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/level 6/);
  });

  it("rejects Turn Undead from a non-cleric", async () => {
    await createCharacter(XP_L6, "paladin", "oath of vengeance");
    const res = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cleric/i);
  });

  // ── Multiclass: one shared pool, effect menu is the union (#1340) ──────────

  it("Cleric 6 / Paladin 4 (Devotion): both classes' options draw on the ONE shared pool", async () => {
    await createMulticlass(XP_L10, [
      { name: "cleric", subclass: null, level: 6 },
      { name: "paladin", subclass: "oath of devotion", level: 4 },
    ]);

    const initial = await agent().get(`/api/characters/${FIXTURE_ID}`);
    expect(initial.status).toBe(200);
    const initialPool = (initial.body.resources.pools as { key: string; total: number }[]).find(
      (p) => p.key === "channelDivinity",
    );
    // #1225: Cleric's 2024 pool is the real SRD 5.2 progression (3 at L6,
    // not the pre-retab edition-blind 2) — Paladin's own pool stays a flat 1
    // from L3 on (paladin.ts, not yet retabbed).
    expect(initialPool?.total).toBe(3); // max(cleric@6→3, paladin@4→1)

    const turnUndead = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(turnUndead.status).toBe(200);
    expect(cdUsed(turnUndead.body)).toBe(1);

    const sacredWeapon = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Sacred Weapon"] }]);
    expect(sacredWeapon.status).toBe(200);
    expect(cdUsed(sacredWeapon.body)).toBe(2); // same pool — both classes' options spent from it

    const third = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(third.status).toBe(200);
    expect(cdUsed(third.body)).toBe(3);

    const fourth = await cast([{ type: "castChannelDivinity", abilityId: optionId["Channel Divinity: Turn Undead"] }]);
    expect(fourth.status).toBe(400);
    expect(fourth.body.error).toMatch(/only 0 remaining/);
  });

  // ── GET picker ──────────────────────────────────────────────────────────────

  it("GET /channel-divinity returns only the entitled options with DCs", async () => {
    await createCharacter(XP_L3, "paladin", "oath of vengeance");
    const res = await agent().get(`/api/characters/${FIXTURE_ID}/channel-divinity`);
    expect(res.status).toBe(200);
    const names = (res.body as { name: string }[]).map((o) => o.name);
    expect(names).toContain("Channel Divinity: Abjure Enemy");
    expect(names).toContain("Channel Divinity: Vow of Enmity");
    expect(names).not.toContain("Channel Divinity: Turn Undead"); // cleric-only
    expect(names).not.toContain("Channel Divinity: Sacred Weapon"); // devotion-only
    const abjure = (res.body as { name: string; saveDc: number | null; kind: string }[]).find(
      (o) => o.name === "Channel Divinity: Abjure Enemy",
    )!;
    // Charisma-based DC: 8 + prof(2) + chaMod(+3) = 13.
    expect(abjure).toMatchObject({ kind: "announce", saveDc: 13 });
  });

  // #1412: the route derives the edition from the character row (editionOf), so
  // there is no query param here. The fixture shares Turn Undead's EXACT name on
  // purpose — CHANNEL_DIVINITY_OPTIONS is a literal-name map, so a distinctly
  // named row is dropped by the pre-existing `o.gate &&` guard regardless of
  // edition, and the test would be green before and after the change. Cleric,
  // not the paladin fixture: Turn Undead is cleric-gated.
  //
  // Built inside the test with try/finally rather than in beforeAll — a beforeAll
  // fixture races loadOption's own beforeAll and would corrupt the cast tests'
  // optionId map.
  it("(#1412) GET /channel-divinity resolves a same-name 2014/NULL Turn Undead fork per the character's edition", async () => {
    const fork = await upsertEditionRow(
      prisma.grantedAbility,
      { name: "Channel Divinity: Turn Undead", edition: "EDITION_2014" },
      {
        name: "Channel Divinity: Turn Undead",
        source: "channelDivinity",
        edition: "EDITION_2014",
        description: "2014 Turn Undead fixture.",
        saveAbility: "wisdom",
        costKind: "pool",
        costPoolKey: "channelDivinity",
        costBase: 1,
      },
      { source: "channelDivinity" },
    );
    try {
      await createCharacter(XP_L2, "cleric", null, "EDITION_2024");
      const as2024 = await agent().get(`/api/characters/${FIXTURE_ID}/channel-divinity`);
      expect(as2024.status).toBe(200);
      const turn2024 = (as2024.body as { id: string; name: string }[]).filter(
        (o) => o.name === "Channel Divinity: Turn Undead",
      );
      expect(turn2024).toHaveLength(1);
      expect(turn2024[0].id).toBe(optionId["Channel Divinity: Turn Undead"]);

      await prisma.character.deleteMany({ where: { id: FIXTURE_ID } });
      await createCharacter(XP_L2, "cleric", null, "EDITION_2014");
      const as2014 = await agent().get(`/api/characters/${FIXTURE_ID}/channel-divinity`);
      expect(as2014.status).toBe(200);
      const turn2014 = (as2014.body as { id: string; name: string }[]).filter(
        (o) => o.name === "Channel Divinity: Turn Undead",
      );
      expect(turn2014).toHaveLength(1);
      expect(turn2014[0].id).toBe(fork.id);
    } finally {
      await prisma.grantedAbility.delete({ where: { id: fork.id } });
    }
  });

  it("rejects a castChannelDivinity against a non-channelDivinity id", async () => {
    await createCharacter(XP_L2, "cleric", null);
    const maneuver = await prisma.grantedAbility.findFirst({ where: { source: "maneuver" } });
    const res = await cast([{ type: "castChannelDivinity", abilityId: maneuver!.id }]);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/not found in catalog/);
  });

  // #1345 (Chunk 5, plan audit — not named in the issue as filed): a
  // transient cast, not a permanent snapshot, but still a wrong-edition rule
  // applied to one cast and recorded in the audit event. The fixture's name
  // is deliberately NOT one of CHANNEL_DIVINITY_OPTIONS' keys — the guard
  // sits BEFORE that gate lookup (resolveChannelDivinityCast), so this must
  // 400 on the edition mismatch, never on "Unknown Channel Divinity option".
  it("(#1345) rejects a 2014-tagged Channel Divinity option before the option-name gate lookup", async () => {
    const row = await upsertEditionRow(
      prisma.grantedAbility,
      { name: "XEd Channel Divinity 2014", edition: "EDITION_2014" },
      {
        name: "XEd Channel Divinity 2014",
        source: "channelDivinity",
        edition: "EDITION_2014",
        description: "Cross-edition guard test fixture.",
        costKind: "pool",
        costPoolKey: "channelDivinity",
        costBase: 1,
      },
      { source: "channelDivinity" },
    );
    try {
      await createCharacter(XP_L2, "cleric", null);
      const res = await cast([{ type: "castChannelDivinity", abilityId: row.id }]);
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/2014 rules/);
      expect(res.body.error).toMatch(/2024 rules/);
      expect(res.body.error).not.toMatch(/Unknown Channel Divinity option/);
    } finally {
      await prisma.grantedAbility.delete({ where: { id: row.id } });
    }
  });
});
