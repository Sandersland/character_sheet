import { Prisma } from "@/generated/prisma/client.js";
import { type GrantItem, type CapabilityColumns } from "@/lib/inventory/capabilities.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import {
  abilityModifier,
  characterAdvancementSlots,
  deriveFeatBonuses,
  hitDieFace,
} from "@/lib/srd/srd.js";
import { normalizeResourcesMutable, splitAdvancementsBySlotCap } from "@/lib/classes/resources.js";
import {
  InvalidHitPointOperationError,
  normalizeHitPoints,
  normalizeHitDice,
  type HitPoints,
  type HitDice,
} from "./hp-core.js";

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
  effMax: number;
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
  class: { hitDie: string } | null;
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
      // Selected fields feed two seams: id + capabilities (with used) for the
      // castSpell rest reset (#528), and name/requiresAttunement + capabilities
      // for item-granted resistances (#529, feeding the #456 halve flow below).
      inventoryItems: {
        select: {
          id: true,
          name: true,
          equippedSlot: true,
          attuned: true,
          requiresAttunement: true,
          capabilities: true,
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
          class: { select: { hitDie: true } },
        },
      },
    },
  });
  if (!row) {
    throw new InvalidHitPointOperationError(`Character not found: ${characterId}`);
  }

  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const abilityScores = row.abilityScores as Record<string, number>;
  const conMod = abilityModifier(abilityScores.constitution ?? 10);
  const faces = hitDieFace(hd.die);

  const primaryEntry = row.classEntries[0];

  // Compute the effective HP maximum including feat improvements (e.g. Tough).
  // This is a read-time overlay — hp.max itself stays the feat-free base so
  // the value written back to the DB never includes the feat bonus.
  // Use the in-cap advancements slice so over-cap feats are automatically excluded.
  const advStateForFeat = normalizeResourcesMutable(row.resources);
  const featSlotCap = characterAdvancementSlots(row.classEntries, levelForExperience(row.experiencePoints));
  // Origin feats are kept regardless of the slot cap (#1130).
  const { kept: inCapAdvancements } = splitAdvancementsBySlotCap(advStateForFeat.advancements, featSlotCap);
  const featBonus = deriveFeatBonuses(inCapAdvancements, hd.total);
  // effMax is used for all clamp/ceiling operations instead of hp.max.
  // hp.max is the stored (feat-free) base and is what gets persisted.
  const effMax = hp.max + featBonus.maxHp;

  return {
    tx,
    characterId,
    row,
    hp,
    hd,
    conMod,
    faces,
    effMax,
    primaryEntry,
    beforeClassLevel: primaryEntry?.level ?? null,
  };
}
