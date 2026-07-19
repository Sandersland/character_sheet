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
import { DISCIPLINES } from "./seed/disciplines.js";
import { SHADOW_ARTS } from "./seed/shadow-arts.js";
import { CHANNEL_DIVINITIES } from "./seed/channel-divinity.js";
import { SUBCLASS_CHOICE_OPTIONS } from "./seed/subclass-choices.js";
import { FEATS } from "./seed/feats.js";
import { SPELLS, SPELL_RENAMES } from "./seed/spells.js";
import { applySpellRenames } from "./seed/rename-spells.js";
import { SUBCLASS_GRANTED_SPELLS } from "./seed/subclass-granted-spells.js";
import { PACKS } from "./seed/packs.js";
import { assertUniqueGrantedAbilityNames } from "./seed/guards.js";

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

// Upsert by (classId, name) unique constraint.
async function seedSubclasses(prisma: PrismaClient, classIds: Map<string, string>) {
  for (const sub of SUBCLASSES) {
    const classId = classIds.get(sub.className);
    if (!classId) throw new Error(`Seed error: unknown class "${sub.className}" in SUBCLASSES`);
    await prisma.subclass.upsert({
      where: { classId_name: { classId, name: sub.name } },
      create: { classId, name: sub.name, description: sub.description },
      update: { description: sub.description },
    });
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
  const subclass = await prisma.subclass.findUnique({
    where: { classId_name: { classId, name: g.subclassName } },
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

// Upsert the action catalog by unique key.
async function seedActions(prisma: PrismaClient) {
  for (const action of ACTIONS) {
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
    };
    await prisma.action.upsert({
      where: { key: action.key },
      create: { key: action.key, ...fields },
      update: fields,
    });
  }
}

// Seed maneuver catalog as GrantedAbility rows (source "maneuver"). Every
// maneuver costs 1 superiority die and rolls it (effectDieSource).
async function seedManeuvers(prisma: PrismaClient) {
  for (const maneuver of MANEUVERS) {
    const data = {
      name: maneuver.name,
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
    await prisma.grantedAbility.upsert({
      where: { name: maneuver.name },
      create: data,
      update: data,
    });
  }
}

// Seed elemental discipline catalog — upsert by unique name.
async function seedDisciplines(prisma: PrismaClient) {
  for (const discipline of DISCIPLINES) {
    const data = {
      name: discipline.name,
      source: "discipline",
      description: discipline.description,
      minLevel: discipline.minLevel,
      alwaysKnown: orElse(discipline.alwaysKnown, false),
      saveAbility: orNull(discipline.saveAbility),
      costKind: orNull(discipline.costKind),
      costPoolKey: orNull(discipline.costPoolKey),
      costBase: orNull(discipline.costBase),
      costPerStep: orNull(discipline.costPerStep),
      effectKind: orNull(discipline.effectKind),
      effectDiceCount: orNull(discipline.effectDiceCount),
      effectDiceFaces: orNull(discipline.effectDiceFaces),
      damageType: orNull(discipline.damageType),
      attackType: orNull(discipline.attackType),
      saveEffect: orNull(discipline.saveEffect),
    };
    await prisma.grantedAbility.upsert({
      where: { name: discipline.name },
      create: data,
      update: data,
    });
  }
}

// Seed Shadow Arts catalog — upsert by unique name. Flat 2-ki, no scaling.
async function seedShadowArts(prisma: PrismaClient) {
  for (const art of SHADOW_ARTS) {
    const data = {
      name: art.name,
      source: "shadowArts",
      description: art.description,
      minLevel: 3,
      alwaysKnown: true,
      costKind: "pool",
      costPoolKey: "ki",
      costBase: 2,
      costPerStep: null,
      effectKind: orNull(art.effectKind),
      buffTarget: orNull(art.buffTarget),
      buffModifier: orNull(art.buffModifier),
    };
    await prisma.grantedAbility.upsert({
      where: { name: art.name },
      create: data,
      update: data,
    });
  }
}

// Seed generic subclass "choose N" options (#899) as GrantedAbility rows keyed
// by `source` = the choice's catalogSource. Plain descriptive features — no
// cost/effect columns.
async function seedSubclassChoiceOptions(prisma: PrismaClient) {
  for (const option of SUBCLASS_CHOICE_OPTIONS) {
    const data = {
      name: option.name,
      source: option.source,
      description: option.description,
      minLevel: option.minLevel,
      alwaysKnown: false,
    };
    await prisma.grantedAbility.upsert({
      where: { name: option.name },
      create: data,
      update: data,
    });
  }
}

// Seed Channel Divinity catalog — upsert by unique name. Each spends 1 CD charge.
async function seedChannelDivinities(prisma: PrismaClient) {
  for (const cd of CHANNEL_DIVINITIES) {
    const data = {
      name: cd.name,
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
    await prisma.grantedAbility.upsert({
      where: { name: cd.name },
      create: data,
      update: data,
    });
  }
}

// Seed feat catalog — upsert by unique name, then drop stale (2014) rows. Taken
// feats snapshot their improvements into the character, so a deleted catalog row
// leaves existing advancements intact (no FK).
async function seedFeats(prisma: PrismaClient) {
  for (const feat of FEATS) {
    await prisma.feat.upsert({
      where: { name: feat.name },
      create: feat,
      update: {
        description: feat.description,
        category: feat.category,
        levelPrerequisite: orNull(feat.levelPrerequisite),
        repeatable: orElse(feat.repeatable, false),
        prerequisite: orNull(feat.prerequisite),
        abilityOptions: orElse(feat.abilityOptions, []),
        abilityIncrease: orElse(feat.abilityIncrease, 0),
        improvements: orElse(feat.improvements, []),
      },
    });
  }
  // Log before the destructive drop so the operator sees what's removed (a future
  // homebrew feat row not in FEATS would be dropped here — intentional for 2014 rows).
  const stale = await prisma.feat.findMany({
    where: { name: { notIn: FEATS.map((f) => f.name) } },
    select: { name: true },
  });
  if (stale.length) console.log(`seedFeats: dropping stale catalog rows: ${stale.map((f) => f.name).join(", ")}`);
  await prisma.feat.deleteMany({ where: { name: { notIn: FEATS.map((f) => f.name) } } });
}

// Resolves a background's originFeatName to a Feat id (feats seed first, so the
// row exists); throws on an unknown name. Two backgrounds (Acolyte/Sage) share
// the repeatable Magic Initiate row; the class flavor is a creation-time
// snapshot, not a column.
async function resolveOriginFeatId(prisma: PrismaClient, bg: (typeof BACKGROUNDS)[number]): Promise<string | null> {
  if (!bg.originFeatName) return null;
  const feat = await prisma.feat.findUnique({ where: { name: bg.originFeatName }, select: { id: true } });
  if (!feat) throw new Error(`seedBackgrounds: unknown origin feat "${bg.originFeatName}" for background "${bg.name}"`);
  return feat.id;
}

async function seedBackgrounds(prisma: PrismaClient) {
  for (const background of BACKGROUNDS) {
    const data = {
      name: background.name,
      skillProficiencies: background.skillProficiencies,
      toolProficiencies: background.toolProficiencies ?? [],
      abilityChoices: background.abilityChoices ?? [],
      originFeatId: await resolveOriginFeatId(prisma, background),
    };
    await prisma.background.upsert({ where: { name: background.name }, create: data, update: data });
  }
}

// Seed spell catalog — apply in-place renames FIRST (so the upsert matches the
// renamed row, not a stranded twin), upsert by unique name, then drop stale rows
// (2024-removed spells like Toll the Dead). Learned SpellEntry snapshots are
// unaffected by a catalog drop (no FK); a one-time resync script refreshes them.
async function seedSpells(prisma: PrismaClient) {
  await applySpellRenames(prisma, SPELL_RENAMES);
  for (const spell of SPELLS) {
    await prisma.spell.upsert({
      where: { name: spell.name },
      create: spell,
      update: spell,
    });
  }
  const stale = await prisma.spell.findMany({
    where: { name: { notIn: SPELLS.map((s) => s.name) } },
    select: { name: true },
  });
  if (stale.length) console.log(`seedSpells: dropping stale catalog rows: ${stale.map((s) => s.name).join(", ")}`);
  await prisma.spell.deleteMany({ where: { name: { notIn: SPELLS.map((s) => s.name) } } });
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
  assertUniqueGrantedAbilityNames([
    ...MANEUVERS,
    ...DISCIPLINES,
    ...SHADOW_ARTS,
    ...CHANNEL_DIVINITIES,
    ...SUBCLASS_CHOICE_OPTIONS,
  ]);
  await seedRaces(prisma);
  const classIds = await seedClasses(prisma);
  await seedSubclasses(prisma, classIds);
  await seedActions(prisma);
  await seedManeuvers(prisma);
  await seedDisciplines(prisma);
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
