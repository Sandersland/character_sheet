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

// Per-op context: the mutable hp/hd state + row the appliers (hp-ops.ts) read
// and write, built once per op by buildHpOpContext.

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
    // Union of three shapes over the same rows: castSpell rest-reset (#528: capability
    // id + used), grant derivation (#529: GrantItem name/requiresAttunement), and the
    // paper-doll placement (#565: equippedSlot replaces the derived `equipped`).
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
  /** effectiveMaxHitPoints(hp.max, featMaxHpBonus, exhaustionLevel, row.rulesEdition) — the effective max AT CONTEXT-BUILD TIME. A consumer that changes exhaustion mid-op (applyLongRestOp, decision 6) must recompute via the two fields below rather than reuse this stale value. */
  effMax: number;
  /** The feat-bonus half of effMax's composition (e.g. Tough), exposed so a consumer can recompute effMax against a NEW exhaustion level without re-deriving it (#1321). */
  featMaxHpBonus: number;
  /** conditions.exhaustion at context-build time — see effMax's own comment. */
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
  // `features` (#1528 chunk 0) sits alongside `hitDie` rather than reusing
  // FEATURE_ROWS_ENTRY_SELECT's own `class` shape verbatim: this row already
  // declares its OWN unrelated `class` shape (hitDie), and TS's weak-type
  // check rejects assigning that to a type declaring a differently-shaped
  // `class` field even though both are optional/nullable (registry.ts's
  // EntryScopedClassEntry comment documents the same collision) — so this
  // select widens its EXISTING `class`/adds its own `subclassRef` rather than
  // spreading the shared fragment in. Only the OUTER `class` key collides:
  // the relation arguments themselves are shared (FEATURE_ROWS_CLASS_FEATURES,
  // FEATURE_ROWS_SUBCLASS_FEATURES), so the filter and order can no longer
  // drift here even though the entry-level fragment stays out of reach (#1545).
  // `extraAsiLevels` (#1529): characterAdvancementSlots' featSlotCap read below.
  // `subclassLevel` (#1576): the seeded PHB'14 subclass grant level, fed into
  // deriveRestPools' ClassFeatureRowsCarrier so isSubclassActive no longer
  // depends on a lib/classes/<class>.ts module being present.
  class: {
    hitDie: string;
    extraAsiLevels: number[];
    subclassLevel: number;
    features: ClassFeatureRow[];
  } | null;
  subclassRef: { features: ClassFeatureRow[] } | null;
}

export interface HpOpResult {
  summary: string;
  eventData: Record<string, unknown>;
  damageForConcentration?: number;
}

/**
 * Phase 1: read the character row and assemble the per-op context.
 * State is re-read from the DB for every op so a batch of N levelUp ops
 * applies sequentially (each sees the previous op's writes).
 */
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
      // Selected fields feed two seams: id + capabilities (with used) for the
      // castSpell rest reset (#528), and name/requiresAttunement + capabilities
      // for item-granted resistances (#529, feeding the #456 halve flow below).
      // capabilities are reconstructed from `snapshot` + `capabilityUses` below
      // (#1649) — the four Inventory* mirror relations are gone.
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
          // `features` (#1528 chunk 0): deriveRestPools' featureRows carrier —
          // see ClassEntryRow's own comment for why this can't spread
          // FEATURE_ROWS_ENTRY_SELECT, and FEATURE_ROWS_CLASS_FEATURES for why
          // the relation-level fragment it names instead IS shareable (#1545).
          // `extraAsiLevels` (#1529): the featSlotCap read below
          // (characterAdvancementSlots).
          // `subclassLevel` (#1576): deriveRestPools' carrier needs it so a
          // 2014 Cleric/Sorcerer/Warlock/Druid/Wizard's subclass pools still
          // gate at their PHB'14 level once the class module is gone.
          class: {
            select: {
              hitDie: true,
              extraAsiLevels: true,
              subclassLevel: true,
              features: FEATURE_ROWS_CLASS_FEATURES,
            },
          },
          subclassRef: { select: { features: FEATURE_ROWS_SUBCLASS_FEATURES } },
        },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  // #1321: hp/hd/featMaxHpBonus/exhaustionLevel/effMax all come from ONE call
  // — effectiveMaxHitPointsForRow (conditions.ts) — so this and applyHealInTx
  // (hp-in-tx.ts) never repeat the composition inline.
  const { hp, hd, featMaxHpBonus, exhaustionLevel, effMax } = effectiveMaxHitPointsForRow(row);
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const faces = hitDieFace(hd.die);

  // classEntries' `class.features`/`subclassRef.features` (#1528 chunk 0) are
  // Prisma.JsonValue-typed internally (resourceTotals/etc. are opaque Json
  // columns) — cast to ClassFeatureRow[] here, once, mirroring
  // feature-rows-select.ts's featureRowsOf.
  const classEntries = row.classEntries as unknown as ClassEntryRow[];
  const primaryEntry = classEntries[0];

  // Reconstructs each item's `capabilities` (with `used`) from `snapshot` +
  // `capabilityUses` (#1649) — the shape every reader below (castSpell rest
  // reset, item-granted resistances) already expects.
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
    featMaxHpBonus,
    exhaustionLevel,
    primaryEntry,
    beforeClassLevel: primaryEntry?.level ?? null,
  };
}
