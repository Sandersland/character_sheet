// The evaluator half of #1688's declarative activation constraints — the
// vocabulary itself (ArmorActivationRequirement/RequiresActiveBuffRequirement/
// ActivationRequirement) lives in class-feature-rows.ts (that file stays a
// pure, Prisma-free leaf; this one reads the database, so the split mirrors
// class-feature-rows.ts vs actions.ts's own pure-vocabulary/DB-touching-
// evaluator divide). Called from applyRowDrivenActionInTx
// (routes/character/actions.ts) at activation, server-side — the client only
// ever sees the served `enabled`/`disabledReason` hint, never re-derives this
// gate itself (CLAUDE.md: rules logic is backend-owned).

import type { Prisma } from "@/generated/prisma/client.js";
import { readInventorySnapshot } from "@/lib/inventory/inventory-snapshot-read.js";
import type { ActivationRequirement, ArmorActivationRequirement } from "./class-feature-rows.js";

/** A row's own activation is rejected — the 400 the central errorHandler maps. */
export class ActivationRequirementError extends Error {
  status = 400;
}

/** The four equipped-state booleans `ArmorActivationRequirement` reads — the activation-time twin of selectEquippedBodyArmor's (character-serialize.ts) read-time AC assembly, scoped to just what this gate needs. */
export interface EquippedArmorState {
  hasLightArmor: boolean;
  hasMediumArmor: boolean;
  hasHeavyArmor: boolean;
  hasShield: boolean;
}

function hasBodyArmor(state: EquippedArmorState): boolean {
  return state.hasLightArmor || state.hasMediumArmor || state.hasHeavyArmor;
}

/**
 * Every equipped item's armor category, read straight off InventoryItem's
 * frozen `snapshot` (#1649) — a fresh read inside the activation transaction,
 * not the served (possibly stale) `unarmoredUnshielded` derive-time flag,
 * since an activation can be the very transaction that just changed loadout
 * in a prior op of the same batch.
 */
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

// One armor/shield literal's unmet reason, or null when satisfied — split out
// of unmetActivationRequirements to keep its own branching budget low (the
// fallow cyclomatic/CRAP gate).
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

/**
 * Every unmet requirement's human-readable reason, in authoring order — empty
 * when every requirement (or none authored) is satisfied. The caller 400s on
 * any non-empty result; never called for a toggle row's END half (ending is
 * always legal, mirrors toggleActionsFromRow's own "end always enabled" rule
 * — lib/classes/actions.ts).
 */
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
