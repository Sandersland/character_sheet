import type { Prisma } from "@/generated/prisma/client.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import type { ActivationRequirement, ArmorActivationRequirement } from "./class-feature-rows.js";

export class ActivationRequirementError extends Error {
  status = 400;
}

export interface EquippedArmorState {
  hasLightArmor: boolean;
  hasMediumArmor: boolean;
  hasHeavyArmor: boolean;
  hasShield: boolean;
}

function hasBodyArmor(state: EquippedArmorState): boolean {
  return state.hasLightArmor || state.hasMediumArmor || state.hasHeavyArmor;
}

// Reads a fresh snapshot inside the tx, not the served unarmoredUnshielded flag — an activation can follow a loadout change earlier in the same batch.
export async function currentArmorStateInTx(tx: Prisma.TransactionClient, characterId: string): Promise<EquippedArmorState> {
  const rows = await tx.inventoryItem.findMany({
    where: { characterId, equippedSlot: { not: null } },
    select: { id: true, snapshot: true },
  });
  const state: EquippedArmorState = { hasLightArmor: false, hasMediumArmor: false, hasHeavyArmor: false, hasShield: false };
  for (const row of rows) {
    const category = readInventorySnapshot(row).armor?.armorCategory;
    if (category === "light") state.hasLightArmor = true;
    else if (category === "medium") state.hasMediumArmor = true;
    else if (category === "heavy") state.hasHeavyArmor = true;
    else if (category === "shield") state.hasShield = true;
  }
  return state;
}

function armorRequirementReason(req: ArmorActivationRequirement, state: EquippedArmorState): string | null {
  if (req === "noMediumArmor" && state.hasMediumArmor) return "cannot be activated while wearing medium armor";
  if (req === "noHeavyArmor" && state.hasHeavyArmor) return "cannot be activated while wearing heavy armor";
  if (req === "noShield" && state.hasShield) return "cannot be activated while wielding a shield";
  if (req === "noBodyArmor" && hasBodyArmor(state)) return "cannot be activated while wearing armor";
  return null;
}

function isRequiresActiveBuff(req: ActivationRequirement): req is { requiresActiveBuff: string } {
  return typeof req === "object" && req !== null;
}

export interface ActivationRequirementContext {
  armor: EquippedArmorState;
  activeBuffKeys: ReadonlySet<string>;
}

// Never called for a toggle row's END half — ending is always legal, mirroring toggleActionsFromRow's own rule.
export function unmetActivationRequirements(
  requires: readonly ActivationRequirement[] | null | undefined,
  ctx: ActivationRequirementContext,
): string[] {
  const reasons: string[] = [];
  for (const req of requires ?? []) {
    if (isRequiresActiveBuff(req)) {
      if (!ctx.activeBuffKeys.has(req.requiresActiveBuff)) {
        reasons.push(`requires ${req.requiresActiveBuff} to be active`);
      }
      continue;
    }
    const reason = armorRequirementReason(req, ctx.armor);
    if (reason) reasons.push(reason);
  }
  return reasons;
}
