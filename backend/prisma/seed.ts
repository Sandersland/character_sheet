import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

import { PrismaClient } from "../src/generated/prisma/client.js";
// This file is the upsert entrypoint (it must stay at prisma/seed.ts per
// prisma.config.ts); every data array below is imported from a per-domain
// module under seed/.
import { CLASSES, BACKGROUNDS, ITEMS, type CatalogItem } from "./seed/catalog-data.js";
import { ACTIONS } from "./seed/actions.js";
import { MANEUVERS } from "./seed/maneuvers.js";
import { SHADOW_ARTS } from "./seed/shadow-arts.js";
import { DISCIPLINES } from "./seed/disciplines.js";
import { CHANNEL_DIVINITIES } from "./seed/channel-divinity.js";
import { SUBCLASS_CHOICE_OPTIONS } from "./seed/subclass-choices.js";
import { FEATS } from "./seed/feats.js";
import { SPELLS, SPELL_RENAMES, type CatalogSpell } from "./seed/spells.js";
import { SPELLS_2014 } from "./seed/spells-2014/index.js";
import { applySpellRenames } from "./seed/rename-spells.js";
import { seedSpellClassesFor } from "./seed/seed-spell-classes.js";
import { seedSubclassGrantedSpells } from "./seed/seed-granted-spells.js";
import { seedSubclassSpellListExpansions } from "./seed/seed-spell-list-expansions.js";
import { seedClassFeatures } from "./seed/seed-class-features.js";
import { seedSubclasses } from "./seed/seed-subclasses.js";
import { seedSpecies } from "./seed/seed-species.js";
import { seedSpeciesTraits } from "./seed/seed-species-traits.js";
import { seedSpeciesGrantedSpells } from "./seed/seed-species-granted-spells.js";
import { seedStartingEquipment } from "./seed/seed-starting-equipment.js";
import { PACKS } from "./seed/packs.js";
import { assertUniqueGrantedAbilityNames } from "./seed/guards.js";
import { assertSeedContentValid } from "./seed/validate.js";
import { resolveEditionRow, upsertEditionRow, withEditionOrShared } from "../src/lib/rules/catalog-edition.js";
import { staleCatalogRowsWhere } from "./seed/prune.js";
import type { SeedEdition } from "./seed/edition.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

// Keeps the wide mappers flat below — each ?? here would otherwise add a
// branch to every seeder.
const orNull = <T>(v: T | null | undefined): T | null => v ?? null;
const orElse = <T>(v: T | null | undefined, fallback: T): T => v ?? fallback;

function itemDetailCreateFields(item: CatalogItem) {
  return {
    weaponDetail: item.weapon ? { create: item.weapon } : undefined,
    armorDetail: item.armor ? { create: item.armor } : undefined,
    consumableDetail: item.consumable ? { create: item.consumable } : undefined,
  };
}

// A true 1:1 optional relation can nested-upsert directly on update, unlike
// the 1:many class/inventory relations elsewhere in this file that have to
// deleteMany+create instead.
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

// Returns className → id so subclasses can resolve their parent class.
async function seedClasses(prisma: PrismaClient) {
  const classIds = new Map<string, string>();
  for (const cls of CLASSES) {
    const row = await prisma.characterClass.upsert({ where: { name: cls.name }, create: cls, update: cls });
    classIds.set(row.name, row.id);
  }
  return classIds;
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
      // NULL = shared (#1306) — every class row. Part of the where key: the
      // 2024 row would otherwise overwrite its 2014 twin on every reseed.
      edition,
    };
    // upsertEditionRow, not .upsert(): the compound-key shorthand can't
    // express a null edition (which every class row has).
    await upsertEditionRow(prisma.action, { key: action.key, edition }, { key: action.key, ...fields }, fields);
  }
  // "key", not "name": Action has both, and `name` is NOT unique here
  // ("Channel Divinity" is two rows), so pruning on it would delete live
  // catalog content. No extraWhere — this seeder owns every Action row.
  //
  // Each row's OWN edition goes into the seeded list, not a flat null: an
  // edition absent from it gets `notIn: []`, which matches every row in that
  // partition, so a forked row listed as shared would be deleted on reseed.
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
    // upsertEditionRow, not .upsert(): the compound-key shorthand can't express a null edition.
    await upsertEditionRow(prisma.grantedAbility, { name: maneuver.name, edition }, data, data);
  }
}

// No scaling on any row (#1502), so effectKind/buffTarget/buffModifier stay
// fixed nulls rather than per-row fields. costPoolKey/costBase are per-row
// (ki/2 for 2014, focus/1 for 2024) — the one thing that genuinely forks.
async function seedShadowArts(prisma: PrismaClient) {
  for (const art of SHADOW_ARTS) {
    const edition = art.edition;
    const data = {
      name: art.name,
      edition,
      source: "shadowArts",
      description: art.description,
      minLevel: 3,
      alwaysKnown: true,
      costKind: "pool",
      costPoolKey: art.costPoolKey,
      costBase: art.costBase,
      costPerStep: null,
      effectKind: null,
      buffTarget: null,
      buffModifier: null,
    };
    await upsertEditionRow(prisma.grantedAbility, { name: art.name, edition }, data, data);
  }
  // source: "shadowArts" passed in as extraWhere so this never touches
  // maneuvers/channelDivinity rows sharing the same table. Each row's OWN
  // edition goes into the seeded list, not a flat null — an edition absent
  // from it gets `notIn: []`, which matches (and deletes) every row in that partition.
  const staleWhere = staleCatalogRowsWhere(
    "name",
    SHADOW_ARTS.map((a) => ({ identity: a.name, edition: a.edition })),
    { source: "shadowArts" },
  );
  const stale = await prisma.grantedAbility.findMany({ where: staleWhere, select: { name: true } });
  if (stale.length) console.log(`seedShadowArts: dropping stale catalog rows: ${stale.map((a) => a.name).join(", ")}`);
  await prisma.grantedAbility.deleteMany({ where: staleWhere });
}

// Seed the Way of the Four Elements discipline catalog (2014-only, #1503) —
// upsert by (name, edition). Unlike seedSubclassChoiceOptions below, each row
// carries its own cost (Ki, "pool") and, where the discipline deals damage, an
// EffectSpec — the cast handler (lib/classes/disciplines.ts) reads both.
async function seedDisciplines(prisma: PrismaClient) {
  for (const discipline of DISCIPLINES) {
    const data = {
      name: discipline.name,
      edition: discipline.edition,
      source: "discipline",
      description: discipline.description,
      minLevel: discipline.minLevel,
      alwaysKnown: orElse(discipline.alwaysKnown, false),
      costKind: discipline.costKind,
      costPoolKey: orNull(discipline.costPoolKey),
      costBase: orNull(discipline.costBase),
      costPerStep: orNull(discipline.costPerStep),
      effectKind: orNull(discipline.effectKind),
      effectDiceCount: orNull(discipline.effectDiceCount),
      effectDiceFaces: orNull(discipline.effectDiceFaces),
      damageType: orNull(discipline.damageType),
      attackType: orNull(discipline.attackType),
      saveAbility: orNull(discipline.saveAbility),
      saveEffect: orNull(discipline.saveEffect),
    };
    await upsertEditionRow(
      prisma.grantedAbility,
      { name: discipline.name, edition: discipline.edition },
      data,
      data,
    );
  }
  // Every seeded row is EDITION_2014 (Way of the Four Elements has no 2024
  // counterpart), so the NULL and EDITION_2024 partitions both get `notIn:
  // []`, matching every `source: "discipline"` row — deliberately, to sweep
  // orphaned pre-retirement rows. The same shape is a DATA-LOSS bug the other
  // direction (see prune.ts), but with an all-EDITION_2014 seeded list it's
  // the intended cleanup.
  const staleWhere = staleCatalogRowsWhere(
    "name",
    DISCIPLINES.map((d) => ({ identity: d.name, edition: d.edition })),
    { source: "discipline" },
  );
  const stale = await prisma.grantedAbility.findMany({ where: staleWhere, select: { name: true, edition: true } });
  if (stale.length) {
    console.log(`seedDisciplines: dropping stale catalog rows: ${stale.map((d) => `${d.name} (${d.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.grantedAbility.deleteMany({ where: staleWhere });
}

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
  // Scoped by `source` to the set THIS array actually seeds, so it never
  // touches maneuver/shadowArts/discipline/channelDivinity rows sharing this table.
  const staleWhere = staleCatalogRowsWhere(
    "name",
    SUBCLASS_CHOICE_OPTIONS.map((o) => ({ identity: o.name, edition: o.edition ?? null })),
    { source: { in: [...new Set(SUBCLASS_CHOICE_OPTIONS.map((o) => o.source))] } },
  );
  const stale = await prisma.grantedAbility.findMany({ where: staleWhere, select: { name: true, edition: true } });
  if (stale.length) {
    console.log(`seedSubclassChoiceOptions: dropping stale catalog rows: ${stale.map((o) => `${o.name} (${o.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.grantedAbility.deleteMany({ where: staleWhere });
}

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
  // Retagging a row from `edition: null` to a concrete edition CREATES a new
  // row via upsertEditionRow's findFirst-by-(name,edition) and ORPHANS the
  // pre-existing NULL-edition row — without this prune, withEditionOrShared's
  // null-is-shared fallback keeps serving that orphan forever. Each row's OWN
  // edition goes into the seeded list, not a flat null, so a genuinely-forked
  // name doesn't get its OTHER edition's row swept by the same call.
  const staleWhere = staleCatalogRowsWhere(
    "name",
    CHANNEL_DIVINITIES.map((cd) => ({ identity: cd.name, edition: cd.edition ?? null })),
    { source: "channelDivinity" },
  );
  const stale = await prisma.grantedAbility.findMany({ where: staleWhere, select: { name: true, edition: true } });
  if (stale.length) {
    console.log(`seedChannelDivinities: dropping stale catalog rows: ${stale.map((c) => `${c.name} (${c.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.grantedAbility.deleteMany({ where: staleWhere });
}

// Taken feats snapshot their improvements into the character, so a deleted
// catalog row leaves existing advancements intact (no FK).
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
        classes: orElse(feat.classes, []),
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

// Two backgrounds (Acolyte/Sage) share the repeatable Magic Initiate row; the
// class flavor is a creation-time snapshot, not a column.
//
// Pinned to EDITION_2024 rather than a bare `edition: null` lookup: Origin
// feat grants are PHB'24-only, and a null-only match would fail once a
// background's origin feat has no shared row left. This FK is a
// REFERENCE-DISPLAY DEFAULT ONLY — a character actually being created
// re-resolves the origin feat against ITS OWN edition in
// character-create.ts's buildOriginEntry, so this seed-time pin never reaches
// a live character's snapshot uncorrected.
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

// Split from normalizedBackgroundFields/backgroundSeedData/seedBackgrounds
// purely to keep each function's own complexity under the repo's health gate.
function normalizedToolChoiceFields(background: (typeof BACKGROUNDS)[number]) {
  return {
    toolChoices: background.toolChoices ?? [],
    toolChoiceCount: background.toolChoiceCount ?? 0,
  };
}

function normalizedBackgroundFields(background: (typeof BACKGROUNDS)[number]) {
  return {
    skillProficiencies: background.skillProficiencies,
    toolProficiencies: background.toolProficiencies ?? [],
    ...normalizedToolChoiceFields(background),
    abilityChoices: background.abilityChoices ?? [],
  };
}

async function backgroundSeedData(
  prisma: PrismaClient,
  background: (typeof BACKGROUNDS)[number],
  edition: SeedEdition | null,
) {
  return {
    name: background.name,
    ...normalizedBackgroundFields(background),
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
// concentration=true when SRD 5.2 dropped its concentration). `classes` is
// dropped here (#1711) — seedSpells writes it to SpellClass separately, via
// seedSpellClassesFor, once the row's id is known.
function spellSeedData(spell: CatalogSpell) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to exclude `classes` from `rest`; SpellClass owns membership (#1711)
  const { classes, ...rest } = spell;
  return { ...SPELL_COLUMN_DEFAULTS, ...rest };
}

// spells.ts entries default to EDITION_2024 (SRD 5.2 text, not "valid in both
// editions"); SPELLS_2014 rows are already tagged EDITION_2014, so this is a
// no-op for those. One function, so seedSpells' upsert loop and its prune
// below can never drift onto two different defaults (#1710).
function resolvedSpellEdition(spell: Pick<CatalogSpell, "edition">): SeedEdition {
  return spell.edition ?? "EDITION_2024";
}

// Find-then-create, not a true `.upsert()`: (kind, scope, name, edition) is
// CatalogEntry's business key, but Prisma's compound-key shorthand can't
// express a null owner arm any more cleanly than it can a null edition.
async function upsertGlobalSpellCatalogEntry(prisma: PrismaClient, name: string, edition: SeedEdition): Promise<string> {
  const existing = await prisma.catalogEntry.findFirst({
    where: { kind: "SPELL", scope: "GLOBAL", name, edition },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.catalogEntry.create({
    data: { kind: "SPELL", scope: "GLOBAL", name, edition },
    select: { id: true },
  });
  return created.id;
}

// Apply in-place renames FIRST (so the upsert matches the renamed row, not a
// stranded twin), then upsertEditionRow by (name, edition) so a same-name
// 2014/2024 fork lands as siblings rather than one overwriting the other
// (#1710). Learned SpellEntry snapshots are unaffected by a catalog drop (no
// FK); a one-time resync script refreshes them.
async function seedSpells(prisma: PrismaClient) {
  await applySpellRenames(prisma, SPELL_RENAMES);
  const allSpells: CatalogSpell[] = [...SPELLS, ...SPELLS_2014];
  for (const spell of allSpells) {
    const edition = resolvedSpellEdition(spell);
    // Every seeded spell is 1:1 with its own GLOBAL CatalogEntry (#1796) —
    // resolved BEFORE the Spell upsert since catalogEntryId is a required,
    // uniquely-constrained column with no default.
    const catalogEntryId = await upsertGlobalSpellCatalogEntry(prisma, spell.name, edition);
    const data = { ...spellSeedData(spell), edition, catalogEntryId };
    // upsertEditionRow for consistency with every other editioned catalog
    // seeder, even though every spell here already resolves to a concrete edition.
    const row = await upsertEditionRow(prisma.spell, { name: spell.name, edition }, data, data);
    // #1711: SpellClass rows carry no edition column (Shape 1) — this
    // spell's own row already IS the edition fork, so its membership rows
    // never need one.
    await seedSpellClassesFor(prisma, row.id, spell.classes);
  }
  const staleWhere = staleCatalogRowsWhere("name", allSpells.map((s) => ({ identity: s.name, edition: resolvedSpellEdition(s) })));
  const stale = await prisma.spell.findMany({ where: staleWhere, select: { id: true, name: true, edition: true, catalogEntryId: true } });
  if (stale.length) {
    console.log(`seedSpells: dropping stale catalog rows: ${stale.map((s) => `${s.name} (${s.edition ?? "shared"})`).join(", ")}`);
  }
  await prisma.spell.deleteMany({ where: staleWhere });
  // Spell.catalogEntryId carries no Prisma relation, so dropping a stale
  // Spell row above does NOT cascade to its CatalogEntry — swept explicitly
  // here or a stale spell's GLOBAL entry would linger as a phantom entitlement.
  if (stale.length) {
    await prisma.catalogEntry.deleteMany({ where: { id: { in: stale.map((s) => s.catalogEntryId) } } });
  }
}

// Returns itemName → id so packs can resolve their contents.
async function seedItems(prisma: PrismaClient) {
  const itemIdsByName = new Map<string, string>();
  for (const item of ITEMS) {
    const { name, category, weight, cost, description, toolCategory } = item;
    const row = await prisma.item.upsert({
      // Names are unique per scope, not globally (#1645), so the seed has to
      // say WHICH scope it owns — otherwise a DM's campaign row of the same
      // name would be a candidate for the catalog's upsert.
      where: { scopeKey_name: { scopeKey: "global", name } },
      // scope/scopeKey are create-only: an existing row's scope is not the
      // seed's to change, and writing them on update would let a reseed
      // silently re-scope a row #1646 had moved.
      create: { name, category, weight, cost, description, toolCategory: orNull(toolCategory), scope: "GLOBAL", scopeKey: "global", ...itemDetailCreateFields(item) },
      update: { name, category, weight, cost, description, toolCategory: orNull(toolCategory), ...itemDetailUpsertFields(item) },
    });
    itemIdsByName.set(row.name, row.id);
  }
  return itemIdsByName;
}

// Contents are replaced wholesale (deleteMany + create) since PackContent has
// no stable business key to upsert against.
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
  // Fails fast on a malformed row before any upsert runs, rather than writing
  // a broken catalog row that only 500s later.
  assertSeedContentValid();
  assertUniqueGrantedAbilityNames([
    ...MANEUVERS,
    ...SHADOW_ARTS,
    ...CHANNEL_DIVINITIES,
    ...SUBCLASS_CHOICE_OPTIONS,
    ...DISCIPLINES,
  ]);
  await seedSpecies(prisma);
  // #1682: trait content, resolved against the Species/SpeciesVariant rows
  // seedSpecies just wrote — must run after it.
  await seedSpeciesTraits(prisma);
  const classIds = await seedClasses(prisma);
  await seedSubclasses(prisma, classIds);
  // Feature rows FK both classes and subclasses seeded above (#1522/#1523).
  await seedClassFeatures(prisma);
  await seedActions(prisma);
  await seedManeuvers(prisma);
  await seedShadowArts(prisma);
  await seedDisciplines(prisma);
  await seedChannelDivinities(prisma);
  await seedSubclassChoiceOptions(prisma);
  await seedFeats(prisma);
  await seedBackgrounds(prisma);
  await seedSpells(prisma);
  await seedSubclassGrantedSpells(prisma, classIds);
  // #1631: the SubclassGrantedSpell sibling family — same ordering
  // constraint (subclasses AND spells must already be seeded).
  await seedSubclassSpellListExpansions(prisma, classIds);
  // #1683: 2024 lineage/legacy spell tracks — needs Species (seedSpecies,
  // above) AND the Spell catalog (seedSpells, just above) both seeded.
  await seedSpeciesGrantedSpells(prisma);
  const itemIdsByName = await seedItems(prisma);
  await seedPacks(prisma, itemIdsByName);
  // No reader yet (#1534) — StartingEquipmentPackage rows are inert until
  // then. Runs after seedPacks/seedItems so its catalogName resolution
  // reflects the just-seeded catalog rows too.
  await seedStartingEquipment(prisma);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
