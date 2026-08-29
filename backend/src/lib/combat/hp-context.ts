import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { capabilityColumnsFromSnapshot, type GrantItem, type CapabilityColumns } from "@/lib/inventory/capabilities.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import {
  abilityModifier,
  hitDieFace,
} from "@/lib/srd/srd.js";
import type { ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import { FEATURE_ROWS_CLASS_FEATURES, FEATURE_ROWS_SUBCLASS_FEATURES } from "@/lib/classes/feature-rows-select.js";
import { InvalidHitPointOperationError, type HitPoints, type HitDice } from "./hp-core.js";
import { effectiveMaxHitPointsForRow } from "./conditions.js";

export interface HpOpContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  row: {
    hitPoints: Prisma.JsonValue;
    hitDice: Prisma.JsonValue;
    abilityScores: Prisma.JsonValue;
    experiencePoints: number;
    spellcasting: Prisma.JsonValue;
    resources: Prisma.JsonValue;
    activeEffects: Prisma.JsonValue;
    conditions: Prisma.JsonValue;
    rulesEdition: RulesEdition;
    classEntries: ClassEntryRow[];
    // A union of three shapes: castSpell rest-reset (capability id+used), grant derivation
    // (GrantItem), and paper-doll placement (equippedSlot).
    inventoryItems?: (Omit<GrantItem, "capabilities" | "equipped"> & {
      id: string;
      capabilities: (CapabilityColumns & { id: string; used?: number | null })[];
      equippedSlot: string | null;
    })[];
  };
  hp: HitPoints;
  hd: HitDice;
  conMod: number;
  faces: number;
  // The effective max AT CONTEXT-BUILD TIME; a consumer that changes exhaustion mid-op (applyLongRestOp)
  // must recompute via maxHpBonus/exhaustionLevel below rather than reuse this stale value.
  effMax: number;
  // Exposed so a consumer can recompute effMax against a NEW exhaustion level without re-deriving it.
  maxHpBonus: number;
  exhaustionLevel: number;
  primaryEntry: ClassEntryRow | undefined;
  beforeClassLevel: number | null;
}

export interface ClassEntryRow {
  id: string;
  level: number;
  name: string;
  subclass: string | null;
  classId: string | null;
  position: number;
  // This select widens the existing `class` (adds subclassRef) instead of spreading a shared
  // fragment: TS's weak-type check rejects assigning a row with a differently-shaped `class` even
  // when both are optional (see EntryScopedClassEntry for the same collision). Only the
  // outer `class` key collides — the relation args (FEATURE_ROWS_CLASS_FEATURES/FEATURE_ROWS_SUBCLASS_FEATURES) stay shared.
  // extraAsiLevels feeds characterAdvancementSlots' featSlotCap read below.
  // subclassLevel is the seeded PHB'14 subclass grant level, fed into deriveRestPools' ClassFeatureRowsCarrier.
  class: {
    name: string;
    hitDie: string;
    extraAsiLevels: number[];
    subclassLevel: number;
    features: ClassFeatureRow[];
  } | null;
  // slug feeds draconicResilienceMaxHpTerm's FK identity input; casterFraction/spellcastingAbility feed
  // restoreWarlockPactSlots' deriveMulticlassSpellcasting call.
  subclassRef: { slug: string; features: ClassFeatureRow[]; casterFraction: "third" | null; spellcastingAbility: string | null } | null;
}

export interface HpOpResult {
  summary: string;
  eventData: Record<string, unknown>;
  damageForConcentration?: number;
}

// State is re-read from the DB for every op so a batch of N ops applies sequentially, each seeing the previous op's writes.
export async function buildHpOpContext(
  tx: Prisma.TransactionClient,
  characterId: string,
): Promise<HpOpContext> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      hitPoints: true,
      hitDice: true,
      abilityScores: true,
      experiencePoints: true,
      spellcasting: true,
      resources: true,
      activeEffects: true,
      conditions: true,
      rulesEdition: true,
      // Feeds two seams: castSpell rest reset and item-granted resistances. capabilities are
      // reconstructed from `snapshot` + `capabilityUses` below; the Inventory* mirror relations are gone.
      inventoryItems: {
        select: {
          id: true,
          name: true,
          equippedSlot: true,
          attuned: true,
          requiresAttunement: true,
          snapshot: true,
          capabilityUses: true,
        },
      },
      classEntries: {
        orderBy: { position: "asc" as const },
        select: {
          id: true,
          level: true,
          name: true,
          subclass: true,
          classId: true,
          position: true,
          class: {
            select: {
              name: true,
              hitDie: true,
              extraAsiLevels: true,
              fightingStyleFeatLevel: true,
              subclassLevel: true,
              features: FEATURE_ROWS_CLASS_FEATURES,
            },
          },
          subclassRef: {
            select: { slug: true, casterFraction: true, spellcastingAbility: true, features: FEATURE_ROWS_SUBCLASS_FEATURES },
          },
        },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  // hp/hd/maxHpBonus/exhaustionLevel/effMax all come from effectiveMaxHitPointsForRow, so this and
  // applyHealInTx never repeat the composition inline.
  const { hp, hd, maxHpBonus, exhaustionLevel, effMax } = effectiveMaxHitPointsForRow(row);
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const faces = hitDieFace(hd.die);

  // class.features/subclassRef.features are Prisma.JsonValue-typed internally; cast to
  // ClassFeatureRow[] here once, mirroring featureRowsOf's own cast.
  const classEntries = row.classEntries as unknown as ClassEntryRow[];
  const primaryEntry = classEntries[0];

  // Reconstructs each item's capabilities from `snapshot` + `capabilityUses` into the shape every reader below expects.
  const inventoryItems = row.inventoryItems.map((item) => {
    const snapshot = readInventorySnapshot(item);
    const usedByKey = new Map(item.capabilityUses.map((u) => [u.capabilityKey, u.used]));
    return {
      id: item.id,
      name: item.name,
      equippedSlot: item.equippedSlot,
      attuned: item.attuned,
      requiresAttunement: item.requiresAttunement,
      capabilities: snapshot.capabilities.map((c) => capabilityColumnsFromSnapshot(c, usedByKey.get(c.key) ?? 0)),
    };
  });

  return {
    tx,
    characterId,
    row: { ...row, classEntries, inventoryItems },
    hp,
    hd,
    conMod,
    faces,
    effMax,
    maxHpBonus,
    exhaustionLevel,
    primaryEntry,
    beforeClassLevel: primaryEntry?.level ?? null,
  };
}
