// Eldritch Knight Weapon Bond, PHB'14 p.75: bond up to two weapons; bonded weapons can't be disarmed, summon to hand as a bonus action.
// Bonded-weapon selection is this module's bond/unbond ops (ABILITY_REGISTRY "weapon-bond"), never PATCH. The "Summon bonded weapon" bonus action is a plain DERIVED_ACTIONS row, enabled via a synthetic "weaponBond" resource pool built from weaponBondEligible + a count of weaponBonded inventory rows.
// "Can't be disarmed" stays reminder text — there is no disarm mechanic to guard against.
// 2024 Eldritch Knight text is unverified and PARKED (#1531) — this feature stays 2014-only until that lands.

import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { editionOf } from "@/lib/rules/edition.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { resolveSubclassSlug, type SubclassIdentityInput } from "./subclass-slug.js";
import type { BondWeaponOperation, UnbondWeaponOperation, WeaponBondOperation } from "@character-sheet/contracts";

export class InvalidWeaponBondOperationError extends Error {
  status = 400;
}

// Cap breach -> explicit 409, mirroring AttunementLimitError. Not exported: domainErrors registers only the base InvalidWeaponBondOperationError (instanceof matches this subclass too).
class WeaponBondLimitError extends InvalidWeaponBondOperationError {
  status = 409;
}

export const WEAPON_BOND_LEVEL = 3;
export const WEAPON_BOND_LIMIT = 2;

// Total-mapping per #1527 (mirrors subclassGateLevel) — never `=== EDITION_…`.
export function weaponBondAvailable(edition: RulesEdition): boolean {
  switch (edition) {
    case "EDITION_2014":
      return true;
    case "EDITION_2024":
      // PHB'24 text is unverified/PARKED (#1531) — stays 2014-only until that lands.
      return false;
    default: {
      const exhaustive: never = edition;
      throw new Error(`weaponBondAvailable: unhandled edition ${String(exhaustive)}`);
    }
  }
}

export function hasWeaponBond(entryLevel: number, isEldritchKnight: boolean, edition: RulesEdition): boolean {
  return isEldritchKnight && entryLevel >= WEAPON_BOND_LEVEL && weaponBondAvailable(edition);
}

type EldritchKnightEntry = SubclassIdentityInput & { name: string; level: number };

// Resolved via resolveSubclassSlug (FK preferred, exact name as fallback) — never a substring/name-literal match.
export function eldritchKnightEntry<E extends EldritchKnightEntry>(classEntries: E[]): E | undefined {
  return classEntries.find(
    (e) => e.name.toLowerCase() === "fighter" && resolveSubclassSlug("fighter", e) === "fighter-eldritch-knight",
  );
}

// The ONE shared rule the bond/unbond ops, reconcileWeaponBond, and the clamp-on-read all call (CLAUDE.md: a reconciler and its clamp-on-read must resolve to the same function) — never two inline copies.
// Uses effectiveEntryLevel, the same per-entry scoping deriveEntryScopedActions uses for every other subclass action, so the mutation gate can never disagree with which character sees the Summon Bonded Weapon action.
export function weaponBondEligible<E extends EldritchKnightEntry>(
  classEntries: E[],
  totalLevel: number,
  edition: RulesEdition,
): { eligible: boolean; entry: E | undefined } {
  const entry = eldritchKnightEntry(classEntries);
  const entryLevel = entry ? effectiveEntryLevel(entry.level, classEntries.length, totalLevel) : 0;
  return { eligible: hasWeaponBond(entryLevel, Boolean(entry), edition), entry };
}

const WEAPON_BOND_SELECT = {
  experiencePoints: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: {
      name: true,
      level: true,
      subclass: true,
      subclassId: true,
      subclassRef: { select: { slug: true } },
    },
  },
} satisfies Prisma.CharacterSelect;

type WeaponBondRow = Prisma.CharacterGetPayload<{ select: typeof WEAPON_BOND_SELECT }>;

function requireWeaponBondEligible(row: WeaponBondRow): void {
  const totalLevel = levelForExperience(row.experiencePoints);
  const { eligible } = weaponBondEligible(row.classEntries, totalLevel, editionOf(row));
  if (!eligible) {
    throw new InvalidWeaponBondOperationError(
      `Weapon Bond requires an Eldritch Knight (2014) at level ${WEAPON_BOND_LEVEL}+`,
    );
  }
}

async function bondWeapon(
  tx: Prisma.TransactionClient,
  row: WeaponBondRow,
  op: BondWeaponOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  requireWeaponBondEligible(row);

  const item = await tx.inventoryItem.findUnique({
    where: { id: op.inventoryItemId },
    select: { id: true, characterId: true, name: true, category: true },
  });
  if (!item || item.characterId !== characterId) {
    throw new InvalidWeaponBondOperationError(`Inventory item not found on this character: ${op.inventoryItemId}`);
  }
  if (item.category !== "weapon") {
    throw new InvalidWeaponBondOperationError(`${item.name} is not a weapon — Weapon Bond only bonds weapons`);
  }

  // Serializes concurrent bondWeapon calls for the SAME character before the already-bonded check and the cap recount below: under READ COMMITTED, two concurrent requests could each read pre-write state while the other's UPDATE is uncommitted — letting a 3rd weapon bond past the cap, or (both targeting the same item) both see weaponBonded: false, both write true, and both log a weaponBonded event for one real transition, corrupting LIFO undo.
  // Locking the Character row makes every read after this line authoritative: a blocked FOR UPDATE re-evaluates against the latest COMMITTED state once the first request's transaction finishes.
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;

  // Re-read under the lock, not the pre-lock `item` above — the authoritative check for whether this bond is actually a false→true transition.
  const locked = await tx.inventoryItem.findUniqueOrThrow({
    where: { id: item.id },
    select: { weaponBonded: true },
  });
  if (locked.weaponBonded) {
    throw new InvalidWeaponBondOperationError(`${item.name} is already bonded`);
  }

  const bondedCount = await tx.inventoryItem.count({ where: { characterId, weaponBonded: true } });
  if (bondedCount >= WEAPON_BOND_LIMIT) {
    throw new WeaponBondLimitError(`Cannot bond more than ${WEAPON_BOND_LIMIT} weapons — unbond one first`);
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { weaponBonded: true } });

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "weaponBonded",
    summary: `Bonded ${item.name} (Weapon Bond)`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { weaponBonded: false },
    after: { weaponBonded: true },
    batchId,
    sessionId,
  });
}

async function unbondWeapon(
  tx: Prisma.TransactionClient,
  op: UnbondWeaponOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const item = await tx.inventoryItem.findUnique({
    where: { id: op.inventoryItemId },
    select: { id: true, characterId: true, name: true },
  });
  if (!item || item.characterId !== characterId) {
    throw new InvalidWeaponBondOperationError(`Inventory item not found on this character: ${op.inventoryItemId}`);
  }

  // Same TOCTOU shape as bondWeapon's own lock: two concurrent unbondWeapon calls on the SAME item could otherwise both read weaponBonded: true unlocked, both write false, and both log a weaponUnbonded event for one real transition.
  await tx.$queryRaw`SELECT id FROM "Character" WHERE id = ${characterId} FOR UPDATE`;

  // Re-read under the lock — the authoritative check for whether this unbond is actually a true→false transition.
  const locked = await tx.inventoryItem.findUniqueOrThrow({
    where: { id: item.id },
    select: { weaponBonded: true },
  });
  if (!locked.weaponBonded) {
    throw new InvalidWeaponBondOperationError(`${item.name} is not bonded`);
  }

  await tx.inventoryItem.update({ where: { id: item.id }, data: { weaponBonded: false } });

  await logEvent(tx, {
    characterId,
    category: "inventory",
    type: "weaponUnbonded",
    summary: `Unbonded ${item.name}`,
    entityType: "InventoryItem",
    entityId: item.id,
    before: { weaponBonded: true },
    after: { weaponBonded: false },
    batchId,
    sessionId,
  });
}

// Mirrors applyInventoryOperations' shape (one batchId, per-op character re-read) — kept as its own module rather than folded into the inventory domain because bonding is class/level/edition-gated, unlike attune/unattune which gate only on the item itself.
export async function applyWeaponBondOperations(
  characterId: string,
  operations: WeaponBondOperation[],
): Promise<void> {
  await runCharacterTransaction<typeof WEAPON_BOND_SELECT, WeaponBondOperation>(characterId, operations, {
    select: WEAPON_BOND_SELECT,
    notFound: (id) => new InvalidWeaponBondOperationError(`Character not found: ${id}`),
    applyOp: async (ctx: CharacterTxContext<WeaponBondRow, WeaponBondOperation>) => {
      const { tx, row, op, characterId: id, batchId, sessionId } = ctx;
      if (op.type === "bondWeapon") {
        await bondWeapon(tx, row, op, id, batchId, sessionId);
      } else {
        await unbondWeapon(tx, op, id, batchId, sessionId);
      }
    },
  });
}
