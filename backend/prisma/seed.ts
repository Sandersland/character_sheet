import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
// Pure catalog seed data (no side effects) — see prisma/seed/*.ts. This file is
// the upsert entrypoint (it must stay at prisma/seed.ts per prisma.config.ts);
// every data array below is imported from a per-domain module under seed/.
import { RACES, CLASSES, BACKGROUNDS, ITEMS, type CatalogItem } from "./seed/catalog-data.js";
import { ACTIONS } from "./seed/actions.js";
import { SUBCLASSES } from "./seed/subclasses.js";
import { MANEUVERS } from "./seed/maneuvers.js";
import { SHADOW_ARTS } from "./seed/shadow-arts.js";
import { CHANNEL_DIVINITIES } from "./seed/channel-divinity.js";
import { SUBCLASS_CHOICE_OPTIONS } from "./seed/subclass-choices.js";
import { FEATS } from "./seed/feats.js";
import { SPELLS, SPELL_RENAMES, type CatalogSpell } from "./seed/spells.js";
import { applySpellRenames } from "./seed/rename-spells.js";
import { SUBCLASS_GRANTED_SPELLS } from "./seed/subclass-granted-spells.js";
import { PACKS } from "./seed/packs.js";
import { assertUniqueGrantedAbilityNames } from "./seed/guards.js";
import { assertSeedContentValid } from "./seed/validate.js";
import { resolveEditionRow, upsertEditionRow, withEditionOrShared } from "../src/lib/rules/catalog-edition.js";
import { staleCatalogRowsWhere } from "./seed/prune.js";
import type { SeedEdition } from "./seed/edition.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Optional catalog field → explicit null / fallback for Prisma. Keeps the wide
// mappers flat (each ?? here would otherwise add a branch to every seeder).
const orNull = <T>(v: T | null | undefined): T | null => v ?? null;
const orElse = <T>(v: T | null | undefined, fallback: T): T => v ?? fallback;

// Nested-create fields for an Item's optional 1:1 detail relations.
function itemDetailCreateFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon ? { create: item.weapon } : undefined,
    armorDetail: item.armor ? { create: item.armor } : undefined,
    consumableDetail: item.consumable ? { create: item.consumable } : undefined,
  };
}

// Same, but for the `update` side of an upsert — a true 1:1 optional
// relation can nested-upsert directly, unlike the 1:many class/inventory
// relations elsewhere in this file that have to deleteMany+create instead.
function itemDetailUpsertFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon
      ? { upsert: { create: item.weapon, update: item.weapon } }
      : undefined,
    armorDetail: item.armor
      ? { upsert: { create: item.armor, update: item.armor } }
      : undefined,
    consumableDetail: item.consumable
      ? { upsert: { create: item.consumable, update: item.consumable } }
      : undefined,
  };
}

async function seedRaces(prisma: PrismaClient) {
  for (const race of RACES) {
    await prisma.race.upsert({ where: { name: race.name }, create: race, update: race });
  }
}

// Returns className → id so subclasses can resolve their parent class.
async function seedClasses(prisma: PrismaClient) {
  const classIds = new Map<string, string>();
  for (const cls of CLASSES) {
    const row = await prisma.characterClass.upsert({ where: { name: cls.name }, create: cls, update: cls });
    classIds.set(row.name, row.id);
  }
  return classIds;
}

// Upsert by (slug, edition) — the immutable identity key (#1277), not
// (classId, name, edition): keying on slug is what makes a display-name
// RENAME a pure content edit (renaming `sub.name` alone under a name-keyed
// upsert would miss the find, `create` a duplicate row, and hit the new
// slug_edition index — see R3). `classId`/`name` still flow through as UPDATE
// fields so a rename actually lands on the existing row. Prisma's compound-key
// `where: { slug_edition: {...} }` shorthand can't express a null edition (see
// upsertEditionRow), so this finds-then-writes instead.
async function seedSubclasses(prisma: PrismaClient, classIds: Map<string, string>) {
  for (const sub of SUBCLASSES) {
    const classId = classIds.get(sub.className);
    if (!classId) throw new Error(`Seed error: unknown class "${sub.className}" in SUBCLASSES`);
    const edition = sub.edition ?? null;
    await upsertEditionRow(
      prisma.subclass,
      { slug: sub.slug, edition },
      { classId, name: sub.name, description: sub.description, slug: sub.slug, edition },
      { classId, name: sub.name, description: sub.description },
    );
  }
}

// Resolve one granted-spell seed row's subclass + catalog spell to ids and upsert
// it. A missing class/subclass/spell is a hard seed error (mirrors the other
// catalogs' fail-fast on unknown references).
async function upsertGrantedSpell(
  prisma: PrismaClient,
  classIds: Map<string, string>,
  g: (typeof SUBCLASS_GRANTED_SPELLS)[number],
) {
  const classId = classIds.get(g.className);
  if (!classId) throw new Error(`Seed error: unknown class "${g.className}" in SUBCLASS_GRANTED_SPELLS`);
  // Every seeded subclass is edition: null (shared) today (#1306) — no granted
  // spell yet targets an edition-forked subclass. findFirst, not findUnique:
  // the compound-key shorthand can't express a null edition (upsertEditionRow).
  const subclass = await prisma.subclass.findFirst({
    where: { classId, name: g.subclassName, edition: null },
    select: { id: true },
  });
  if (!subclass) throw new Error(`Seed error: unknown subclass "${g.subclassName}" for ${g.className}`);
  const spell = await prisma.spell.findUnique({ where: { name: g.spellName }, select: { id: true } });
  if (!spell) throw new Error(`Seed error: granted spell "${g.spellName}" not in the Spell catalog`);
  await prisma.subclassGrantedSpell.upsert({
    where: { subclassId_spellId: { subclassId: subclass.id, spellId: spell.id } },
    create: { subclassId: subclass.id, spellId: spell.id, gateLevel: g.gateLevel, castingAbility: g.castingAbility },
    update: { gateLevel: g.gateLevel, castingAbility: g.castingAbility },
  });
}

// Subclass-granted spells (#898). Runs after subclasses AND spells are seeded.
async function seedSubclassGrantedSpells(prisma: PrismaClient, classIds: Map<string, string>) {
  for (const g of SUBCLASS_GRANTED_SPELLS) await upsertGrantedSpell(prisma, classIds, g);
}

// Upsert the action catalog by (key, edition), then drop stale rows.
async function seedActions(prisma: PrismaClient) {
  for (const action of ACTIONS) {
    const edition = orNull(action.edition);
    const fields = {
      name: action.name,
      description: action.description,
      cost: action.cost,
      universal: action.universal ?? false,
      grantClass: orNull(action.grantClass),
      grantSubclass: orNull(action.grantSubclass),
      grantLevel: orNull(action.grantLevel),
      resourceKey: orNull(action.resourceKey),
      resourceAmount: orNull(action.resourceAmount),
      // NULL = shared (#1306) — every class row. Part of the where key since
      // #1430 forked the universal rows; writing by `key` alone would have the
      // 2024 row overwrite its 2014 twin on every reseed.
      edition,
    };
    // upsertEditionRow, not .upsert(): the compound-key shorthand can't
    // express a null edition (which every class row has).
    await upsertEditionRow(prisma.action, { key: action.key, edition }, { key: action.key, ...fields }, fields);
  }
  // Drops the 12 pre-fork NULL-edition universal rows on the first reseed after
  // #1430 — intentional, and the reason the prune wiring and the seed fork must
  // land in the SAME deploy: a half-deployed pair leaves the universal catalog
  // empty and the Action sheet's tile grid blank.
  //
  // "key", not the model's other identity column: Action has BOTH `name` and
  // `key`, and `name` is NOT unique here ("Channel Divinity" is two rows), so
  // pruning on it would delete live catalog content. No extraWhere — this
  // seeder owns every Action row.
  //
  // Each row's OWN edition goes into the seeded list, not a flat null: an
  // edition absent from it gets `notIn: []`, which matches every row in that
  // partition, so a forked row listed as shared would be deleted by the very
  // next reseed (both directions proven in action-fork-reseed.test.ts).
  const staleWhere = staleCatalogRowsWhere(
    "key",
    ACTIONS.map((a) => ({ identity: a.key, edition: a.edition ?? null })),
  );
  const stale = await prisma.action.findMany({ where: staleWhere, select: { key: true, edition: true } });
  if (stale.length) {
    console.log(`seedActions: dropping stale catalog rows: ${stale.map((a) => `${a.key} (${a.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.action.deleteMany({ where: staleWhere });
}

// Seed maneuver catalog as GrantedAbility rows (source "maneuver"). Every
// maneuver costs 1 superiority die and rolls it (effectDieSource).
async function seedManeuvers(prisma: PrismaClient) {
  for (const maneuver of MANEUVERS) {
    const edition = maneuver.edition ?? null;
    const data = {
      name: maneuver.name,
      edition,
      source: "maneuver",
      description: maneuver.description,
      minLevel: 3,
      alwaysKnown: false,
      placement: maneuver.placement,
      actionSlot: orNull(maneuver.actionSlot),
      selfTempHp: orElse(maneuver.selfTempHp, false),
      saveAbility: orNull(maneuver.saveAbility),
      costKind: "pool",
      costPoolKey: "superiorityDice",
      costBase: 1,
      effectDieSource: "superiorityDice",
    };
    // upsertEditionRow, not .upsert(): the compound-key shorthand can't express
    // a null edition (see its docstring).
    await upsertEditionRow(prisma.grantedAbility, { name: maneuver.name, edition }, data, data);
  }
}

// Seed the Shadow Arts catalog — upsert by (name, edition). Flat 1-focus, no scaling
// (2024 rewrite, #1246: was flat 2-focus across a 4-spell menu; now a single
// always-concentrating Darkness cast, so effectKind/buffTarget/buffModifier are
// fixed nulls rather than per-row fields).
async function seedShadowArts(prisma: PrismaClient) {
  for (const art of SHADOW_ARTS) {
    const edition = art.edition ?? null;
    const data = {
      name: art.name,
      edition,
      source: "shadowArts",
      description: art.description,
      minLevel: 3,
      alwaysKnown: true,
      costKind: "pool",
      costPoolKey: "focus",
      costBase: 1,
      costPerStep: null,
      effectKind: null,
      buffTarget: null,
      buffModifier: null,
    };
    await upsertEditionRow(prisma.grantedAbility, { name: art.name, edition }, data, data);
  }
  // Drop the retired 2014 rows (Silence/Pass without Trace/Darkvision) — same
  // edition-partitioned staleCatalogRowsWhere seedFeats uses (#1306); source:
  // "shadowArts" passed in as extraWhere so this never touches
  // maneuvers/channelDivinity rows sharing the same table.
  //
  // Each row's OWN edition goes into the seeded list, not a flat null: an
  // edition absent from it gets `notIn: []`, which matches every row in that
  // partition — so a 2014 art listed as shared would be deleted by the very
  // next reseed (proven in granted-ability-fork-reseed.test.ts).
  const staleWhere = staleCatalogRowsWhere(
    "name",
    SHADOW_ARTS.map((a) => ({ identity: a.name, edition: a.edition ?? null })),
    { source: "shadowArts" },
  );
  const stale = await prisma.grantedAbility.findMany({ where: staleWhere, select: { name: true } });
  if (stale.length) console.log(`seedShadowArts: dropping stale catalog rows: ${stale.map((a) => a.name).join(", ")}`);
  await prisma.grantedAbility.deleteMany({ where: staleWhere });
}

// Seed generic subclass "choose N" options (#899) as GrantedAbility rows keyed
// by `source` = the choice's catalogSource. Plain descriptive features — no
// cost/effect columns.
async function seedSubclassChoiceOptions(prisma: PrismaClient) {
  for (const option of SUBCLASS_CHOICE_OPTIONS) {
    const edition = option.edition ?? null;
    const data = {
      name: option.name,
      edition,
      source: option.source,
      description: option.description,
      minLevel: option.minLevel,
      alwaysKnown: false,
    };
    await upsertEditionRow(prisma.grantedAbility, { name: option.name, edition }, data, data);
  }
}

// Seed Channel Divinity catalog — upsert by (name, edition). Each spends 1 CD charge.
async function seedChannelDivinities(prisma: PrismaClient) {
  for (const cd of CHANNEL_DIVINITIES) {
    const edition = cd.edition ?? null;
    const data = {
      name: cd.name,
      edition,
      source: "channelDivinity",
      description: cd.description,
      minLevel: 2,
      alwaysKnown: true,
      costKind: "pool",
      costPoolKey: "channelDivinity",
      costBase: 1,
      costPerStep: null,
      saveAbility: orNull(cd.saveAbility),
      effectKind: orNull(cd.effectKind),
      buffTarget: orNull(cd.buffTarget),
      buffModifier: null,
    };
    await upsertEditionRow(prisma.grantedAbility, { name: cd.name, edition }, data, data);
  }
}

// Seed feat catalog — upsert by (name, edition), then drop stale rows. Taken
// feats snapshot their improvements into the character, so a deleted catalog row
// leaves existing advancements intact (no FK).
async function seedFeats(prisma: PrismaClient) {
  for (const feat of FEATS) {
    const edition = feat.edition ?? null;
    // upsertEditionRow, not .upsert(): the compound-key shorthand can't
    // express a null edition.
    await upsertEditionRow(
      prisma.feat,
      { name: feat.name, edition },
      { ...feat, edition },
      {
        description: feat.description,
        category: feat.category,
        levelPrerequisite: orNull(feat.levelPrerequisite),
        repeatable: orElse(feat.repeatable, false),
        prerequisite: orNull(feat.prerequisite),
        abilityOptions: orElse(feat.abilityOptions, []),
        abilityIncrease: orElse(feat.abilityIncrease, 0),
        improvements: orElse(feat.improvements, []),
      },
    );
  }
  const staleWhere = staleCatalogRowsWhere("name", FEATS.map((f) => ({ identity: f.name, edition: f.edition ?? null })));
  // Log before the destructive drop so the operator sees what's removed (a future
  // homebrew feat row not in FEATS would be dropped here — intentional for a
  // genuinely retired row of either edition).
  const stale = await prisma.feat.findMany({ where: staleWhere, select: { name: true, edition: true } });
  if (stale.length) {
    console.log(`seedFeats: dropping stale catalog rows: ${stale.map((f) => `${f.name} (${f.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.feat.deleteMany({ where: staleWhere });
}

// Resolves a background's originFeatName to a Feat id (feats seed first, so the
// row exists); throws on an unknown name. Two backgrounds (Acolyte/Sage) share
// the repeatable Magic Initiate row; the class flavor is a creation-time
// snapshot, not a column.
//
// Pinned to EDITION_2024 rather than a bare `edition: null` lookup — Origin
// feat grants are PHB'24-only, and Alert now forks by edition (#1306), so a
// null-only match would fail the moment a background's origin feat has no
// shared row left. This FK is a REFERENCE-DISPLAY DEFAULT ONLY (reference.ts's
// same "no character to resolve against" reasoning) plus a same-edition
// fallback: a character actually being created re-resolves the origin feat
// against ITS OWN edition in character-create.ts's buildOriginEntry, so this
// seed-time pin never reaches a live character's snapshot uncorrected.
async function resolveOriginFeatId(prisma: PrismaClient, bg: (typeof BACKGROUNDS)[number]): Promise<string | null> {
  if (!bg.originFeatName) return null;
  const candidates = await prisma.feat.findMany({
    where: withEditionOrShared({ name: bg.originFeatName }, "EDITION_2024"),
    select: { id: true, edition: true },
  });
  const feat = resolveEditionRow(candidates, "EDITION_2024");
  if (!feat) throw new Error(`seedBackgrounds: unknown origin feat "${bg.originFeatName}" for background "${bg.name}"`);
  return feat.id;
}

// Split out of seedBackgrounds to keep that loop's own complexity low — pure
// field defaulting plus the one async origin-feat lookup.
async function backgroundSeedData(
  prisma: PrismaClient,
  background: (typeof BACKGROUNDS)[number],
  edition: SeedEdition | null,
) {
  return {
    name: background.name,
    skillProficiencies: background.skillProficiencies,
    toolProficiencies: background.toolProficiencies ?? [],
    abilityChoices: background.abilityChoices ?? [],
    originFeatId: await resolveOriginFeatId(prisma, background),
    edition,
  };
}

async function seedBackgrounds(prisma: PrismaClient) {
  for (const background of BACKGROUNDS) {
    const edition = background.edition ?? null;
    const data = await backgroundSeedData(prisma, background, edition);
    await upsertEditionRow(prisma.background, { name: background.name, edition }, data, data);
  }
}

// Every optional Spell column at its reset value (booleans → false, nullable
// scalars → null). `components` (a Json column) is omitted — Prisma rejects a raw
// null there, and no spell ever drops it.
const SPELL_COLUMN_DEFAULTS = {
  concentration: false, ritual: false, cantripScaling: false,
  effectKind: null, effectDiceCount: null, effectDiceFaces: null,
  effectModifier: null, damageType: null, attackType: null,
  saveAbility: null, saveEffect: null, upcastDicePerLevel: null,
  buffTarget: null, buffModifier: null,
} as const;

// Layer the spell over the reset defaults so a toggled-OFF/removed optional
// actually resets on re-seed (#1132): a bare partial update leaves an absent
// optional column at its prior value (this stranded Barkskin at
// concentration=true when SRD 5.2 dropped its concentration). Spread order —
// defaults first — means any field the spell declares still wins.
function spellSeedData(spell: CatalogSpell) {
  return { ...SPELL_COLUMN_DEFAULTS, ...spell };
}

// Seed spell catalog — apply in-place renames FIRST (so the upsert matches the
// renamed row, not a stranded twin), upsert by unique name, then drop stale rows
// (2024-removed spells like Toll the Dead). Learned SpellEntry snapshots are
// unaffected by a catalog drop (no FK); a one-time resync script refreshes them.
async function seedSpells(prisma: PrismaClient) {
  await applySpellRenames(prisma, SPELL_RENAMES);
  const seededNames = SPELLS.map((s) => s.name);
  for (const spell of SPELLS) {
    const data = spellSeedData(spell);
    await prisma.spell.upsert({
      where: { name: spell.name },
      create: data,
      update: data,
    });
  }
  const stale = await prisma.spell.findMany({
    where: { name: { notIn: seededNames } },
    select: { name: true },
  });
  if (stale.length) console.log(`seedSpells: dropping stale catalog rows: ${stale.map((s) => s.name).join(", ")}`);
  await prisma.spell.deleteMany({ where: { name: { notIn: seededNames } } });
}

// Returns itemName → id so packs can resolve their contents.
async function seedItems(prisma: PrismaClient) {
  const itemIdsByName = new Map<string, string>();
  for (const item of ITEMS) {
    const { name, category, weight, cost, description } = item;
    const row = await prisma.item.upsert({
      where: { name },
      create: { name, category, weight, cost, description, ...itemDetailCreateFields(item) },
      update: { name, category, weight, cost, description, ...itemDetailUpsertFields(item) },
    });
    itemIdsByName.set(row.name, row.id);
  }
  return itemIdsByName;
}

// Seed equipment packs. Each pack is upserted by name; contents are replaced
// wholesale (deleteMany + create) since PackContent has no stable business key
// to upsert against — same pattern as classEntries / inventoryItems above.
async function seedPacks(prisma: PrismaClient, itemIdsByName: Map<string, string>) {
  for (const pack of PACKS) {
    const { id: packId } = await prisma.pack.upsert({
      where: { name: pack.name },
      create: { name: pack.name, description: pack.description },
      update: { name: pack.name, description: pack.description },
    });
    await prisma.packContent.deleteMany({ where: { packId } });
    await prisma.packContent.createMany({
      data: pack.contents.map((c) => ({
        packId,
        itemId: itemIdsByName.get(c.itemName)!,
        quantity: c.quantity ?? 1,
      })),
    });
  }
}

async function main() {
  // Zod-validated seed families (#1277) — fails fast on a malformed row (a
  // typo'd slug, an empty description, a cross-row duplicate slug) before any
  // upsert runs, rather than writing a broken catalog row that only 500s later.
  assertSeedContentValid();
  assertUniqueGrantedAbilityNames([
    ...MANEUVERS,
    ...SHADOW_ARTS,
    ...CHANNEL_DIVINITIES,
    ...SUBCLASS_CHOICE_OPTIONS,
  ]);
  await seedRaces(prisma);
  const classIds = await seedClasses(prisma);
  await seedSubclasses(prisma, classIds);
  await seedActions(prisma);
  await seedManeuvers(prisma);
  await seedShadowArts(prisma);
  await seedChannelDivinities(prisma);
  await seedSubclassChoiceOptions(prisma);
  await seedFeats(prisma);
  await seedBackgrounds(prisma);
  await seedSpells(prisma);
  await seedSubclassGrantedSpells(prisma, classIds);
  const itemIdsByName = await seedItems(prisma);
  await seedPacks(prisma, itemIdsByName);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
