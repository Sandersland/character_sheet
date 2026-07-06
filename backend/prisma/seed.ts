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
import { FEATS } from "./seed/feats.js";
import { SPELLS } from "./seed/spells.js";
import { PACKS } from "./seed/packs.js";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

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

async function main() {
  // Fail fast: GrantedAbility.name is globally unique, so the four source
  // arrays must not collide before we upsert them by name.
  const grantedNames = [...MANEUVERS, ...DISCIPLINES, ...SHADOW_ARTS, ...CHANNEL_DIVINITIES].map((a) => a.name);
  const dupeGranted = grantedNames.find((name, i) => grantedNames.indexOf(name) !== i);
  if (dupeGranted) throw new Error(`Seed error: duplicate GrantedAbility name "${dupeGranted}" across maneuvers/disciplines/shadow-arts/channel-divinity`);

  for (const race of RACES) {
    await prisma.race.upsert({ where: { name: race.name }, create: race, update: race });
  }

  const classIds = new Map<string, string>();
  for (const cls of CLASSES) {
    const row = await prisma.characterClass.upsert({ where: { name: cls.name }, create: cls, update: cls });
    classIds.set(row.name, row.id);
  }

  // Seed subclasses — upsert by (classId, name) unique constraint.
  for (const sub of SUBCLASSES) {
    const classId = classIds.get(sub.className);
    if (!classId) throw new Error(`Seed error: unknown class "${sub.className}" in SUBCLASSES`);
    await prisma.subclass.upsert({
      where: { classId_name: { classId, name: sub.name } },
      create: { classId, name: sub.name, description: sub.description },
      update: { description: sub.description },
    });
  }

  // Seed action catalog — upsert by unique key.
  for (const action of ACTIONS) {
    await prisma.action.upsert({
      where: { key: action.key },
      create: {
        key: action.key,
        name: action.name,
        description: action.description,
        cost: action.cost,
        universal: action.universal ?? false,
        grantClass: action.grantClass ?? null,
        grantSubclass: action.grantSubclass ?? null,
        grantLevel: action.grantLevel ?? null,
        resourceKey: action.resourceKey ?? null,
        resourceAmount: action.resourceAmount ?? null,
      },
      update: {
        name: action.name,
        description: action.description,
        cost: action.cost,
        universal: action.universal ?? false,
        grantClass: action.grantClass ?? null,
        grantSubclass: action.grantSubclass ?? null,
        grantLevel: action.grantLevel ?? null,
        resourceKey: action.resourceKey ?? null,
        resourceAmount: action.resourceAmount ?? null,
      },
    });
  }

  // Seed maneuver catalog as GrantedAbility rows (source "maneuver"). Every
  // maneuver costs 1 superiority die and rolls it (effectDieSource).
  for (const maneuver of MANEUVERS) {
    const data = {
      name: maneuver.name,
      source: "maneuver",
      description: maneuver.description,
      minLevel: 3,
      alwaysKnown: false,
      placement: maneuver.placement,
      actionSlot: maneuver.actionSlot ?? null,
      selfTempHp: maneuver.selfTempHp ?? false,
      saveAbility: maneuver.saveAbility ?? null,
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

  // Seed elemental discipline catalog — upsert by unique name.
  for (const discipline of DISCIPLINES) {
    const data = {
      name: discipline.name,
      source: "discipline",
      description: discipline.description,
      minLevel: discipline.minLevel,
      alwaysKnown: discipline.alwaysKnown ?? false,
      saveAbility: discipline.saveAbility ?? null,
      costKind: discipline.costKind ?? null,
      costPoolKey: discipline.costPoolKey ?? null,
      costBase: discipline.costBase ?? null,
      costPerStep: discipline.costPerStep ?? null,
      effectKind: discipline.effectKind ?? null,
      effectDiceCount: discipline.effectDiceCount ?? null,
      effectDiceFaces: discipline.effectDiceFaces ?? null,
      damageType: discipline.damageType ?? null,
      attackType: discipline.attackType ?? null,
      saveEffect: discipline.saveEffect ?? null,
    };
    await prisma.grantedAbility.upsert({
      where: { name: discipline.name },
      create: data,
      update: data,
    });
  }

  // Seed Shadow Arts catalog — upsert by unique name. Flat 2-ki, no scaling.
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
      effectKind: art.effectKind ?? null,
      buffTarget: art.buffTarget ?? null,
      buffModifier: art.buffModifier ?? null,
    };
    await prisma.grantedAbility.upsert({
      where: { name: art.name },
      create: data,
      update: data,
    });
  }

  // Seed Channel Divinity catalog — upsert by unique name. Each spends 1 CD charge.
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
      saveAbility: cd.saveAbility ?? null,
      effectKind: cd.effectKind ?? null,
      buffTarget: cd.buffTarget ?? null,
      buffModifier: null,
    };
    await prisma.grantedAbility.upsert({
      where: { name: cd.name },
      create: data,
      update: data,
    });
  }

  // Seed feat catalog — upsert by unique name.
  for (const feat of FEATS) {
    await prisma.feat.upsert({
      where: { name: feat.name },
      create: feat,
      update: {
        description: feat.description,
        prerequisite: feat.prerequisite ?? null,
        abilityOptions: feat.abilityOptions ?? [],
        abilityIncrease: feat.abilityIncrease ?? 0,
        improvements: feat.improvements ?? [],
      },
    });
  }

  for (const background of BACKGROUNDS) {
    await prisma.background.upsert({
      where: { name: background.name },
      create: background,
      update: background,
    });
  }

  // Seed spell catalog — upsert by unique name, same idempotent pattern as items.
  for (const spell of SPELLS) {
    await prisma.spell.upsert({
      where: { name: spell.name },
      create: spell,
      update: spell,
    });
  }

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

  // Seed equipment packs. Each pack is upserted by name; contents are replaced
  // wholesale (deleteMany + create) since PackContent has no stable business key
  // to upsert against — same pattern as classEntries / inventoryItems above.
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

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
