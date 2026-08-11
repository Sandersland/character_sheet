/**
 * Resource + maneuver transaction handler — the analog to applySpellcastingOperations
 * for trackable class/subclass resources (superiority dice, focus, rage) and
 * known-maneuver lists.
 *
 * What is persisted: `used` counts per resource key and the `maneuversKnown`
 * snapshot array. What is derived at read time (in serializeCharacter): pool
 * totals, die size, recharge timing, maneuver choice count — all via
 * deriveResources().
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { proficiencyBonusForLevel, levelForExperience } from "@/lib/leveling/experience.js";
import { logEvent } from "@/lib/activity/events.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "./class-features.js";
import { FEATURE_ROWS_ENTRY_SELECT, featureRowsOf } from "./feature-rows-select.js";
import { inventoryItemDetailInclude, resolveInventoryItem } from "@/lib/inventory/inventory-types.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";
import { toolsByCategory } from "@/lib/srd/srd.js";
import { SKILL_KEYS } from "@/lib/srd/alignments.js";
import { deriveFeatProficiencies } from "@/lib/srd/feats.js";
import { deriveItemGrants, type GrantItem } from "@/lib/inventory/capabilities.js";
import { rollDie } from "@/lib/core/dice.js";
// Cross-domain HP heal for Uncanny Metabolism's bonusHeal (#1243) — precedented
// by lib/spellcasting/ability-cast.ts, which also composes applyHealInTx from a
// sibling domain's lib file. hp-in-tx.ts needs the mutable-state normalizer for
// its own feat max-HP bonus lookup, so that shape lives in the leaf module
// resources-state.ts (no back-imports) rather than here — importing
// combat/hitpoints.ts from THIS file would otherwise close a cycle through it.
import { applyHealInTx } from "@/lib/combat/hitpoints.js";
import type { DerivedResource, InitiativeBonusHeal, InitiativeRegen } from "./types.js";
import {
  clampChoicesToCaps,
  clearInitiativeRegenMarkers,
  INITIATIVE_REGEN_MARKER_PREFIX,
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  splitAdvancementsBySlotCap,
  type AdvancementEntry,
  type ChoiceEntry,
  type ExpertiseEntry,
  type FeatImprovement,
  type ManeuverEntry,
  type ResourcesMutableState,
  type ToolProfEntry,
} from "./resources-state.js";
import type {
  ForgetExpertiseOperation,
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  ForgetToolProficiencyOperation,
  LearnExpertiseOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
  ResourceOpAudit,
  ResourceOperation,
  RestoreResourceOperation,
  SpendResourceOperation,
} from "@character-sheet/shared-types";

// The op shapes + audit payload are the wire contract and live in shared-types
// (#1273); re-exported so the modules importing them from here (level-up
// submission/transaction, ability-cost, the actions + resources routes) keep
// resolving them unchanged.
export type {
  ForgetManeuverOperation,
  ForgetSubclassChoiceOperation,
  // #1588: LearnExpertiseOperation only — no ceremony ever reuses
  // ForgetExpertiseOperation (freely reversible, no ceremony-scoped forget
  // list), so it stays imported-but-not-re-exported, mirroring
  // ForgetToolProficiencyOperation below.
  LearnExpertiseOperation,
  LearnManeuverOperation,
  LearnSubclassChoiceOperation,
  LearnToolProficiencyOperation,
  ResourceOpAudit,
  ResourceOperation,
  SpendResourceOperation,
};

// Re-exported so existing consumers (character-serialize/classes.ts, hp-core.ts,
// route/test files, …) keep resolving the mutable-state shape + its helpers from
// this module — the definitions now live in resources-state.ts (#1243).
export {
  clampChoicesToCaps,
  clearInitiativeRegenMarkers,
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  splitAdvancementsBySlotCap,
};
export type {
  AdvancementEntry,
  ChoiceEntry,
  ExpertiseEntry,
  FeatImprovement,
  ManeuverEntry,
  ResourcesMutableState,
  ToolProfEntry,
};

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidResourceOperationError extends Error {
  status = 400;
}

// Per-op appliers: each validates + mutates `state` in place (throwing on any illegal op) and
// returns the audit payload the dispatcher writes to the event log.

function applySpendResourceOp(
  state: ResourcesMutableState,
  op: SpendResourceOperation,
  derivedInfo: DerivedClassInfo | null,
): ResourceOpAudit {
  const amount = op.amount ?? 1;
  if (amount <= 0) {
    // fallow-ignore-next-line code-duplication -- applySpendResourceOp/applyRestoreResourceOp share a parallel validate-amount/find-pool/bounds-check shape (spend bounds against pool.total, restore bounds against 0) — pre-existing (unrelated to #1503's own diff), not a target for consolidation here.
    throw new InvalidResourceOperationError("spendResource: amount must be positive");
  }
  const pool = derivedInfo?.resources.find((r) => r.key === op.key);
  if (!pool) {
    throw new InvalidResourceOperationError(
      `Resource "${op.key}" not available for this character's subclass`
    );
  }
  const used = state.used[op.key] ?? 0;
  if (used + amount > pool.total) {
    throw new InvalidResourceOperationError(
      `Cannot spend ${amount} ${pool.label}: only ${pool.total - used} remaining`
    );
  }
  state.used[op.key] = used + amount;
  const remaining = pool.total - state.used[op.key];
  const summary = op.roll !== undefined
    ? `Spent ${amount} ${pool.label} (rolled ${pool.die}: ${op.roll}) — ${remaining}/${pool.total} remaining`
    : `Spent ${amount} ${pool.label} — ${remaining}/${pool.total} remaining`;
  return {
    eventType: "spendResource",
    summary,
    eventData: { key: op.key, amount, roll: op.roll ?? null, remaining },
  };
}

function applyRestoreResourceOp(
  state: ResourcesMutableState,
  op: RestoreResourceOperation,
  derivedInfo: DerivedClassInfo | null,
): ResourceOpAudit {
  const amount = op.amount ?? 1;
  if (amount <= 0) {
    throw new InvalidResourceOperationError("restoreResource: amount must be positive");
  }
  const pool = derivedInfo?.resources.find((r) => r.key === op.key);
  if (!pool) {
    throw new InvalidResourceOperationError(
      `Resource "${op.key}" not available for this character's subclass`
    );
  }
  const used = state.used[op.key] ?? 0;
  if (used - amount < 0) {
    throw new InvalidResourceOperationError(
      `Cannot restore ${amount} ${pool.label}: only ${used} are spent`
    );
  }
  state.used[op.key] = used - amount;
  const newUsed = state.used[op.key];
  return {
    eventType: "restoreResource",
    summary: `Restored ${amount} ${pool.label} — ${pool.total - newUsed}/${pool.total} remaining`,
    eventData: { key: op.key, amount },
  };
}

// Discriminator defaults to the descriptor's position in its pool's
// onInitiative array (#1243) so two oncePerLongRest descriptors on the same
// pool (not used today, but supported) don't collide; a lone descriptor keeps
// a stable key across calls since resourceFn returns array order deterministically.
function initiativeRegenMarkerKey(poolKey: string, discriminator: string | number): string {
  return `${INITIATIVE_REGEN_MARKER_PREFIX}${poolKey}:${discriminator}`;
}

/** One pool's regain from an onInitiative application, for the audit payload. */
export interface InitiativeRegenResult {
  key: string;
  label: string;
  restored: number;
  remaining: number;
  /**
   * Present when the firing descriptor grants a bonus HP heal (Uncanny
   * Metabolism, #1243) — the impure rollInitiative op rolls the die and
   * applies the heal; this pure function only surfaces the descriptor.
   */
  bonusHeal?: InitiativeBonusHeal;
}

/**
 * Apply every derived pool's `onInitiative` regen(s) (#1239/#1243) to
 * `state.used`, returning what was regained. A pool's `onInitiative` may be a
 * single descriptor or an array of them (#1243 — e.g. Monk Focus at L15+
 * combines Uncanny Metabolism with Perfect Focus); each fires independently.
 * "all" fully refills; a numeric amount tops the pool up to at least that many
 * available (never spends). oncePerLongRest descriptors fire at most once per
 * long-rest cycle — tracked by a marker in `used` (set whenever the descriptor
 * fires, even if nothing was expended to regain) that clearInitiativeRegenMarkers
 * resets on a long rest. A oncePerLongRest descriptor carrying a `bonusHeal`
 * always reports once it fires (even restoring nothing) so the impure caller
 * still rolls the heal; a plain top-up descriptor reports only when it actually
 * restores something. Generic: any class pool can declare onInitiative (Focus,
 * superiority dice, Bardic Inspiration); inert for pools without it. Pure +
 * exported so it's unit-testable and a future combat-start hook can reuse it.
 * Mirrors applyRestoreResourceOp.
 */
// One onInitiative descriptor's regen against its pool: fires (respecting the
// once-per-long-rest marker), tops up state.used, and returns the result — or
// null when there's nothing to report (already fired this rest, or nothing
// restored and no bonusHeal to signal). Split into three single-purpose
// helpers (marker gate / target math / orchestration) so a pool's multiple
// descriptors (#1243) stay under the complexity gate — one combined function
// tripped it (CRAP 43).

// Whether `regen` may fire right now, consuming its once-per-long-rest marker
// as a side effect when it does. Always true for a descriptor with no rest cap.
function markerAllowsFiring(
  state: ResourcesMutableState,
  pool: DerivedResource,
  regen: InitiativeRegen,
  discriminator: string | number,
): boolean {
  if (!regen.oncePerLongRest) return true;
  const markerKey = initiativeRegenMarkerKey(pool.key, regen.id ?? discriminator);
  if (state.used[markerKey]) return false; // already fired since the last long rest
  state.used[markerKey] = 1;
  return true;
}

// "all" clears all spend; a numeric target N tops up to N available, i.e.
// used = total − N, never raising `used` (never spends) and never below 0.
function regenTargetUsed(pool: DerivedResource, regen: InitiativeRegen, used: number): number {
  return regen.amount === "all" ? 0 : Math.max(0, Math.min(used, pool.total - regen.amount));
}

// Whether `regen`'s explicit threshold (#1500) permits firing, given the
// pool's current REMAINING count — independent of `amount` (Perfect Self
// only fires at 0 remaining, not "below 4" the way topping to 4 alone would
// imply). Always true for a descriptor with no threshold. Split out (mirrors
// markerAllowsFiring above) so applyOneInitiativeDescriptor itself stays
// under the complexity gate — one combined function tripped it (CRAP 43)
// even before this field existed.
function meetsThreshold(pool: DerivedResource, regen: InitiativeRegen, used: number): boolean {
  return regen.threshold === undefined || pool.total - used <= regen.threshold;
}

// The InitiativeRegenResult object, or null when there's nothing to report
// (nothing restored and no bonusHeal to signal) — split out purely to keep
// applyOneInitiativeDescriptor's own branching budget low (fallow's
// complexity gate; one combined function tripped it at CRAP 43 even before
// the #1500 threshold field existed).
function regenResult(
  state: ResourcesMutableState,
  pool: DerivedResource,
  regen: InitiativeRegen,
  restored: number,
): InitiativeRegenResult | null {
  if (restored === 0 && !regen.bonusHeal) return null;
  return {
    key: pool.key,
    label: pool.label,
    restored,
    remaining: pool.total - (state.used[pool.key] ?? 0),
    ...(regen.bonusHeal ? { bonusHeal: regen.bonusHeal } : {}),
  };
}

function applyOneInitiativeDescriptor(
  state: ResourcesMutableState,
  pool: DerivedResource,
  regen: InitiativeRegen,
  discriminator: string | number,
): InitiativeRegenResult | null {
  if (!markerAllowsFiring(state, pool, regen, discriminator)) return null;
  const used = state.used[pool.key] ?? 0;
  if (!meetsThreshold(pool, regen, used)) return null;
  const targetUsed = regenTargetUsed(pool, regen, used);
  const restored = targetUsed < used ? used - targetUsed : 0;
  if (restored > 0) state.used[pool.key] = targetUsed;
  return regenResult(state, pool, regen, restored);
}

export function applyInitiativeRegen(
  state: ResourcesMutableState,
  derivedInfo: DerivedClassInfo | null,
): InitiativeRegenResult[] {
  const regenerated: InitiativeRegenResult[] = [];
  for (const pool of derivedInfo?.resources ?? []) {
    if (!pool.onInitiative) continue;
    const descriptors = Array.isArray(pool.onInitiative) ? pool.onInitiative : [pool.onInitiative];
    for (const [index, regen] of descriptors.entries()) {
      const result = applyOneInitiativeDescriptor(state, pool, regen, index);
      if (result) regenerated.push(result);
    }
  }
  return regenerated;
}

/**
 * Roll Initiative op core: applies every pool's onInitiative regen(s), then
 * resolves any bonusHeal that fired (Uncanny Metabolism, #1243) — rolling its
 * die server-side (no client input; automatic combat-start effect) and
 * applying the heal via the shared HP path, atomic with the resources write in
 * this same transaction/batch.
 */
async function applyRollInitiativeOp(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: ResourcesMutableState,
  derivedInfo: DerivedClassInfo | null,
  batchId: string,
  sessionId: string | null,
): Promise<ResourceOpAudit> {
  const regenerated = applyInitiativeRegen(state, derivedInfo);

  const parts: string[] = [];
  for (const r of regenerated) {
    if (r.restored > 0) parts.push(`${r.restored} ${r.label}`);
    if (r.bonusHeal) {
      const roll = rollDie(r.bonusHeal.dieFaces);
      const amount = r.bonusHeal.flatBonus + roll;
      await applyHealInTx(tx, characterId, amount, batchId, sessionId, { source: r.bonusHeal.sourceName });
      parts.push(`${amount} HP (${r.bonusHeal.sourceName}: d${r.bonusHeal.dieFaces} roll ${roll} + ${r.bonusHeal.flatBonus})`);
    }
  }

  const summary = parts.length
    ? `Rolled Initiative — regained ${parts.join(", ")}`
    : "Rolled Initiative — no resources to regain";
  return {
    eventType: "initiativeRegen",
    summary,
    eventData: { regenerated },
  };
}

// fallow-ignore-next-line complexity -- pre-existing maneuver-validation branches (dedup/catalog/count); unchanged by #1137, CRAP re-estimated after the fightingStyle-scalar export removal
async function applyLearnManeuverOp(
  tx: Prisma.TransactionClient,
  state: ResourcesMutableState,
  op: LearnManeuverOperation,
  derivedInfo: DerivedClassInfo | null,
  edition: RulesEdition,
): Promise<ResourceOpAudit> {
  if (Boolean(op.maneuverId) === Boolean(op.custom)) {
    throw new InvalidResourceOperationError(
      "learnManeuver: provide exactly one of maneuverId or custom"
    );
  }

  // Enforce choice count limit.
  const choiceCount = derivedInfo?.maneuverChoiceCount;
  if (choiceCount !== undefined && state.maneuversKnown.length >= choiceCount) {
    throw new InvalidResourceOperationError(
      `Cannot learn more maneuvers: already know ${state.maneuversKnown.length}/${choiceCount}`
    );
  }

  let newEntry: ManeuverEntry;

  if (op.maneuverId) {
    // Dedup check.
    if (state.maneuversKnown.some((m) => m.maneuverId === op.maneuverId)) {
      throw new InvalidResourceOperationError(
        `Maneuver already known (maneuverId: ${op.maneuverId})`
      );
    }
    const catalogManeuver = await tx.grantedAbility.findUnique({ where: { id: op.maneuverId } });
    if (!catalogManeuver || catalogManeuver.source !== "maneuver") {
      throw new InvalidResourceOperationError(
        `Maneuver not found in catalog: ${op.maneuverId}`
      );
    }
    // The maneuver's name/description/placement/actionSlot are snapshotted
    // into maneuversKnown below, permanently — this is prevention, not just
    // admission, the same failure mode #1345 guards against for Feat (#1345's
    // audit found this site; the issue as filed named only three sites, all
    // Feat/Subclass, and missed this one).
    const mismatch = crossEditionRejection(catalogManeuver, `Maneuver "${catalogManeuver.name}"`, edition);
    if (mismatch) throw new InvalidResourceOperationError(`learnManeuver: ${mismatch}`);
    newEntry = {
      id: randomUUID(),
      maneuverId: catalogManeuver.id,
      name: catalogManeuver.name,
      description: catalogManeuver.description,
      placement: catalogManeuver.placement ?? undefined,
      actionSlot: catalogManeuver.actionSlot,
    };
  } else {
    const custom = op.custom!;
    newEntry = {
      id: randomUUID(),
      name: custom.name,
      description: custom.description,
    };
  }

  state.maneuversKnown.push(newEntry);
  return {
    eventType: "learnManeuver",
    summary: `Learned maneuver: ${newEntry.name}`,
    eventData: {
      entryId: newEntry.id,
      maneuverName: newEntry.name,
      maneuverId: newEntry.maneuverId ?? null,
    },
  };
}

// #1516: "Each time you learn new maneuvers, you can also replace one
// maneuver you know with a different one" (PHB'14 Battle Master p.73; SRD 5.2
// carries the equivalent grant) — RAW bounds a maneuver replacement to
// learn-time, so this primitive is unreachable outside a validated level-up
// step (ctx.allowChooseNForget), same guard shape as
// applyForgetSubclassChoiceOp below. The reconciler (level-reconciliation.ts)
// trims maneuversKnown directly, never through this op, so it is unaffected —
// gating HERE (the op boundary), not inside a shared trim primitive, is what
// keeps level-down reconciliation working (#1516 decision).
function applyForgetManeuverOp(
  state: ResourcesMutableState,
  op: ForgetManeuverOperation,
  allowChooseNForget: boolean,
): ResourceOpAudit {
  if (!allowChooseNForget) {
    throw new InvalidResourceOperationError(
      "Forgetting a maneuver is only allowed while learning new maneuvers (level-up ceremony)",
    );
  }
  const idx = state.maneuversKnown.findIndex((m) => m.id === op.entryId);
  if (idx === -1) {
    throw new InvalidResourceOperationError(
      `Maneuver entry not found: ${op.entryId}`
    );
  }
  const forgotten = state.maneuversKnown[idx];
  state.maneuversKnown.splice(idx, 1);
  return {
    eventType: "forgetManeuver",
    summary: `Forgot maneuver: ${forgotten.name}`,
    eventData: { entryId: op.entryId, maneuverName: forgotten.name },
  };
}

function applyLearnToolProficiencyOp(
  state: ResourcesMutableState,
  op: LearnToolProficiencyOperation,
  derivedInfo: DerivedClassInfo | null,
): ResourceOpAudit {
  // Validate the name is a known artisan's tool.
  const artisanTools = toolsByCategory("artisan");
  if (!artisanTools.some((t) => t.name === op.name)) {
    throw new InvalidResourceOperationError(
      `"${op.name}" is not a known artisan's tool. Student of War only grants proficiency with artisan's tools.`
    );
  }

  // Enforce choice count limit (Student of War = 1).
  const toolChoiceCount = derivedInfo?.toolProfChoiceCount;
  if (toolChoiceCount !== undefined && state.toolProficienciesKnown.length >= toolChoiceCount) {
    throw new InvalidResourceOperationError(
      `Cannot learn more tool proficiencies: already know ${state.toolProficienciesKnown.length}/${toolChoiceCount} via subclass`
    );
  }

  // Dedup check.
  if (state.toolProficienciesKnown.some((t) => t.name === op.name)) {
    throw new InvalidResourceOperationError(
      `Tool proficiency already known: ${op.name}`
    );
  }

  const newToolEntry: ToolProfEntry = { id: randomUUID(), name: op.name };
  state.toolProficienciesKnown.push(newToolEntry);
  return {
    eventType: "learnToolProficiency",
    summary: `Learned tool proficiency: ${op.name} (Student of War)`,
    eventData: { entryId: newToolEntry.id, toolName: op.name },
  };
}

function applyForgetToolProficiencyOp(
  state: ResourcesMutableState,
  op: ForgetToolProficiencyOperation,
): ResourceOpAudit {
  const toolIdx = state.toolProficienciesKnown.findIndex((t) => t.id === op.entryId);
  if (toolIdx === -1) {
    throw new InvalidResourceOperationError(
      `Tool proficiency entry not found: ${op.entryId}`
    );
  }
  const forgottenTool = state.toolProficienciesKnown[toolIdx];
  state.toolProficienciesKnown.splice(toolIdx, 1);
  return {
    eventType: "forgetToolProficiency",
    summary: `Forgot tool proficiency: ${forgottenTool.name}`,
    eventData: { entryId: op.entryId, toolName: forgottenTool.name },
  };
}

/**
 * Learn Expertise in a skill (#1588) — doubles proficiency bonus on that
 * skill's checks (buildSkillsView, serialize/proficiencies.ts). Validates
 * BOTH the skill key is real and the character is actually proficient in it
 * (`proficientSkills`, computed in applyResourceOpInTx the same way the read
 * path does — base skill rows + feat/class-feature-row + item grants — never
 * trusted from the client) and the level-derived expertiseChoiceCount cap.
 * Freely reversible (applyForgetExpertiseOp below carries no learn-time gate,
 * unlike applyForgetManeuverOp/applyForgetSubclassChoiceOp): Expertise has no
 * RAW swap-only text to bound it to a ceremony step.
 */
function applyLearnExpertiseOp(
  state: ResourcesMutableState,
  op: LearnExpertiseOperation,
  derivedInfo: DerivedClassInfo | null,
  proficientSkills: Set<string>,
): ResourceOpAudit {
  if (!SKILL_KEYS.includes(op.skill)) {
    throw new InvalidResourceOperationError(`"${op.skill}" is not a known skill.`);
  }
  if (!proficientSkills.has(op.skill)) {
    throw new InvalidResourceOperationError(
      `Cannot take Expertise in "${op.skill}": not proficient in that skill.`
    );
  }

  const expertiseChoiceCount = derivedInfo?.expertiseChoiceCount;
  if (expertiseChoiceCount !== undefined && state.expertiseKnown.length >= expertiseChoiceCount) {
    throw new InvalidResourceOperationError(
      `Cannot take more Expertise: already have ${state.expertiseKnown.length}/${expertiseChoiceCount}`
    );
  }

  if (state.expertiseKnown.some((e) => e.skill === op.skill)) {
    throw new InvalidResourceOperationError(`Expertise already taken in: ${op.skill}`);
  }

  const newEntry: ExpertiseEntry = { id: randomUUID(), skill: op.skill };
  state.expertiseKnown.push(newEntry);
  return {
    eventType: "learnExpertise",
    summary: `Took Expertise in: ${op.skill}`,
    eventData: { entryId: newEntry.id, skill: op.skill },
  };
}

function applyForgetExpertiseOp(
  state: ResourcesMutableState,
  op: ForgetExpertiseOperation,
): ResourceOpAudit {
  const idx = state.expertiseKnown.findIndex((e) => e.id === op.entryId);
  if (idx === -1) {
    throw new InvalidResourceOperationError(`Expertise entry not found: ${op.entryId}`);
  }
  const forgotten = state.expertiseKnown[idx];
  state.expertiseKnown.splice(idx, 1);
  return {
    eventType: "forgetExpertise",
    summary: `Removed Expertise in: ${forgotten.skill}`,
    eventData: { entryId: op.entryId, skill: forgotten.skill },
  };
}

// Generic subclass "choose N" appliers (#899): validate against the level-derived subclassChoices declaration: the choice
// must be available at this level/subclass, the option must belong to the
// choice's catalog source, and the pick must stay within the derived count.

// Resolve a subclass-choice op's target (catalog optionId or custom) to a new
// ChoiceEntry, enforcing catalog membership + dedup; keeps
// applyLearnSubclassChoiceOp under the complexity bar.
async function resolveChoiceOption(
  tx: Prisma.TransactionClient,
  op: LearnSubclassChoiceOperation,
  choice: NonNullable<DerivedClassInfo["subclassChoices"]>[number],
  known: ChoiceEntry[],
  edition: RulesEdition,
): Promise<ChoiceEntry> {
  if (!op.optionId) {
    const custom = op.custom!;
    return { id: randomUUID(), name: custom.name, description: custom.description };
  }
  if (known.some((e) => e.optionId === op.optionId)) {
    throw new InvalidResourceOperationError(`Option already chosen (optionId: ${op.optionId})`);
  }
  const option = await tx.grantedAbility.findUnique({ where: { id: op.optionId } });
  if (!option || option.source !== choice.catalogSource) {
    throw new InvalidResourceOperationError(
      `Option not found in the ${choice.label} catalog: ${op.optionId}`,
    );
  }
  // Snapshotted into choicesKnown below, permanently — same prevention
  // reasoning as applyLearnManeuverOp's guard above (#1345, found by this
  // plan's audit, not named in the issue).
  const mismatch = crossEditionRejection(option, `${choice.label} option "${option.name}"`, edition);
  if (mismatch) throw new InvalidResourceOperationError(`learnSubclassChoice: ${mismatch}`);
  return { id: randomUUID(), optionId: option.id, name: option.name, description: option.description };
}

async function applyLearnSubclassChoiceOp(
  tx: Prisma.TransactionClient,
  state: ResourcesMutableState,
  op: LearnSubclassChoiceOperation,
  derivedInfo: DerivedClassInfo | null,
  edition: RulesEdition,
): Promise<ResourceOpAudit> {
  if (Boolean(op.optionId) === Boolean(op.custom)) {
    throw new InvalidResourceOperationError(
      "learnSubclassChoice: provide exactly one of optionId or custom",
    );
  }

  const choice = derivedInfo?.subclassChoices?.find((c) => c.key === op.choiceKey);
  if (!choice) {
    throw new InvalidResourceOperationError(
      `Subclass choice "${op.choiceKey}" is not available for this character at this level`,
    );
  }

  const known = state.choicesKnown[op.choiceKey] ?? [];
  if (known.length >= choice.count) {
    throw new InvalidResourceOperationError(
      `Cannot choose more for ${choice.label}: already chose ${known.length}/${choice.count}`,
    );
  }

  const newEntry = await resolveChoiceOption(tx, op, choice, known, edition);
  state.choicesKnown[op.choiceKey] = [...known, newEntry];
  return {
    eventType: "learnSubclassChoice",
    summary: `Chose ${choice.label}: ${newEntry.name}`,
    eventData: {
      choiceKey: op.choiceKey,
      entryId: newEntry.id,
      optionName: newEntry.name,
      optionId: newEntry.optionId ?? null,
    },
  };
}

// #1516: both editions bound a choose-N replacement to learn-time (PHB'14
// Battle Master maneuvers p.73, Way of the Four Elements disciplines p.81;
// SRD 5.2 carries the equivalent grants) — this primitive is unreachable
// outside a validated level-up step (ctx.allowChooseNForget), which itself
// only carries a forget when subclassChoiceSwapCadence resolved "onLevelUp"
// for that catalogSource (assertSubclassChoiceForgets, level-up-submission.ts)
// — so a non-swappable choice (e.g. Hunter's Prey) is rejected at the
// ceremony layer before it would ever reach here. The reconciler
// (reconcileSubclassChoices) trims choicesKnown directly via
// clampChoicesToCaps, never through this op, so it is unaffected — gating
// HERE (the op boundary), not inside that shared trim primitive, is what
// keeps level-down reconciliation working (#1516 decision).
function applyForgetSubclassChoiceOp(
  state: ResourcesMutableState,
  op: ForgetSubclassChoiceOperation,
  allowChooseNForget: boolean,
): ResourceOpAudit {
  if (!allowChooseNForget) {
    throw new InvalidResourceOperationError(
      "Forgetting a subclass choice is only allowed while learning a new one (level-up ceremony)",
    );
  }
  const known = state.choicesKnown[op.choiceKey] ?? [];
  const idx = known.findIndex((e) => e.id === op.entryId);
  if (idx === -1) {
    throw new InvalidResourceOperationError(
      `Subclass choice entry not found: ${op.entryId} (choice "${op.choiceKey}")`,
    );
  }
  const forgotten = known[idx];
  const next = known.filter((_, i) => i !== idx);
  // Drop the key entirely when emptied so choicesKnown stays free of stale keys.
  if (next.length === 0) delete state.choicesKnown[op.choiceKey];
  else state.choicesKnown[op.choiceKey] = next;
  return {
    eventType: "forgetSubclassChoice",
    summary: `Removed ${op.choiceKey} choice: ${forgotten.name}`,
    eventData: { choiceKey: op.choiceKey, entryId: op.entryId, optionName: forgotten.name },
  };
}

// applyOp dispatch: shared per-op context (mirrors spellcasting.ts's SpellOpContext) + a
// discriminant-keyed handler map, so the transaction handler's applyOp reduces
// to "build context, dispatch, persist" instead of a growing switch.

interface ResourceOpContext {
  tx: Prisma.TransactionClient;
  state: ResourcesMutableState;
  derivedInfo: DerivedClassInfo | null;
  /** Only rollInitiative reads these — its bonusHeal composes applyHealInTx
   *  in the same tx/batch (#1243). */
  characterId: string;
  batchId: string;
  sessionId: string | null;
  /** Gates a client-supplied maneuverId/optionId against the row's edition (#1345). */
  edition: RulesEdition;
  /**
   * #1516: whether this call site is a validated level-up ceremony step
   * (level-up-transaction.ts, after validateLevelUpSubmission's
   * assertManeuverForgets/assertSubclassChoiceForgets already proved the
   * forgetManeuver/forgetSubclassChoice op belongs to a canSwap-carrying
   * step) — false for every other caller, including the generic
   * POST .../resources/transactions route, so a choose-N forget is
   * unreachable outside learn-time. The client never sets this: it is
   * server-computed per call site, never a client-supplied op field.
   */
  allowChooseNForget: boolean;
  /**
   * The character's proficient skill set (#1588), computed once in
   * applyResourceOpInTx the SAME way the read path does (buildSkillsView):
   * base skill rows + feat/class-feature-row-granted + item-granted. Only
   * applyLearnExpertiseOp reads this.
   */
  proficientSkills: Set<string>;
}

// The handler-map return type — async ops return a Promise. Unrelated to the
// frontend's ResourceOpResult, which is an alias for ResourceOpAudit that #1275
// collapses once it rewrites the client.
type ResourceOpResult = ResourceOpAudit | Promise<ResourceOpAudit>;

const RESOURCE_OP_HANDLERS: {
  [K in ResourceOperation["type"]]: (
    ctx: ResourceOpContext,
    op: Extract<ResourceOperation, { type: K }>,
  ) => ResourceOpResult;
} = {
  spendResource: (ctx, op) => applySpendResourceOp(ctx.state, op, ctx.derivedInfo),
  restoreResource: (ctx, op) => applyRestoreResourceOp(ctx.state, op, ctx.derivedInfo),
  rollInitiative: (ctx) =>
    applyRollInitiativeOp(ctx.tx, ctx.characterId, ctx.state, ctx.derivedInfo, ctx.batchId, ctx.sessionId),
  learnManeuver: (ctx, op) => applyLearnManeuverOp(ctx.tx, ctx.state, op, ctx.derivedInfo, ctx.edition),
  forgetManeuver: (ctx, op) => applyForgetManeuverOp(ctx.state, op, ctx.allowChooseNForget),
  learnToolProficiency: (ctx, op) => applyLearnToolProficiencyOp(ctx.state, op, ctx.derivedInfo),
  forgetToolProficiency: (ctx, op) => applyForgetToolProficiencyOp(ctx.state, op),
  learnSubclassChoice: (ctx, op) => applyLearnSubclassChoiceOp(ctx.tx, ctx.state, op, ctx.derivedInfo, ctx.edition),
  forgetSubclassChoice: (ctx, op) => applyForgetSubclassChoiceOp(ctx.state, op, ctx.allowChooseNForget),
  learnExpertise: (ctx, op) => applyLearnExpertiseOp(ctx.state, op, ctx.derivedInfo, ctx.proficientSkills),
  forgetExpertise: (ctx, op) => applyForgetExpertiseOp(ctx.state, op),
};

function dispatchResourceOp(ctx: ResourceOpContext, op: ResourceOperation): ResourceOpResult {
  const handler = RESOURCE_OP_HANDLERS[op.type] as (
    ctx: ResourceOpContext,
    op: ResourceOperation,
  ) => ResourceOpResult;
  return handler(ctx, op);
}

// Shared before/after event snapshot shape for the per-op event log
// (applyResourceOpInTx).
function snapshotResourcesState(state: ResourcesMutableState): {
  resources: ReturnType<typeof snapshotResources>;
} {
  return { resources: snapshotResources(state) };
}

// Columns/relations applyResourceOpInTx re-reads per op; the batch wrapper's
// scaffold row is an existence-only { id: true } check. Every entry (not just
// the primary) + its level is selected so deriveEntryScopedResources can derive
// each entry's own choice-cap fields (#1177).
// #1588: `skills`/`inventoryItems` are additions for applyLearnExpertiseOp's
// proficient-skill validation — must include feat/item-granted proficiencies,
// not just the base skills row, mirroring buildSkillsView's own read-path
// merge (serialize/proficiencies.ts). `inventoryItemDetailInclude` is the
// same fan-in every op applier's live-row read uses (#1649) so
// resolveInventoryItem reconstructs weaponDetail/armorDetail/capabilities
// identically to the read path.
const RESOURCES_SELECT = {
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  rulesEdition: true,
  skills: true,
  inventoryItems: { include: inventoryItemDetailInclude },
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclass: true, level: true, ...FEATURE_ROWS_ENTRY_SELECT },
  },
} satisfies Prisma.CharacterSelect;

// The character's proficient skill set (#1588) — base skill rows +
// feat-granted (deriveFeatProficiencies over the UNCLAMPED state.advancements;
// an over-cap feat is a transient not-yet-reconciled state that the next XP
// op self-heals, same tolerance clamp-on-read already extends elsewhere) +
// item-granted (deriveItemGrants over the resolved inventory). Computed once
// per op so applyLearnExpertiseOp validates against the SAME set the wire
// response's skills[].proficient already reflects.
function proficientSkillsOf(
  row: { skills: unknown; inventoryItems: Parameters<typeof resolveInventoryItem>[0][] },
  state: ResourcesMutableState,
): Set<string> {
  const baseProficient = (row.skills as { name: string; proficient: boolean }[])
    .filter((s) => s.proficient)
    .map((s) => s.name);
  const featProficiencies = deriveFeatProficiencies(state.advancements);
  const resolvedItems = row.inventoryItems.map(resolveInventoryItem);
  const itemGrants = deriveItemGrants(
    resolvedItems.map(
      (i): GrantItem => ({
        name: i.name,
        equipped: i.equippedSlot != null,
        attuned: i.attuned,
        requiresAttunement: i.requiresAttunement,
        capabilities: i.capabilities,
      }),
    ),
  );
  const itemSkillProfs = itemGrants.proficiencies.filter((p) => p.profType === "skill").map((p) => p.value);
  return new Set([...baseProficient, ...featProficiencies.skills, ...itemSkillProfs]);
}

/**
 * Applies one resource op inside a caller-supplied transaction/batchId, so the
 * unified level-up endpoint (#885) and the actions orchestrator can compose a
 * resource change with other domains under one batchId. Reads fresh state via
 * `tx` on every call (a batch of spends sees each prior result), dispatches via
 * dispatchResourceOp → writes back → logs its own event (the single copy of the
 * logic; applySpendResourceInTx is a thin, spend-typed delegate over this).
 *
 * `allowChooseNForget` (#1516) defaults false: only level-up-transaction.ts's
 * caller — after validateLevelUpSubmission already proved a
 * forgetManeuver/forgetSubclassChoice op belongs to a canSwap-carrying step —
 * passes true. Every other caller (the generic resources route, the actions
 * orchestrator's spend/restore composition) leaves it false, which is what
 * makes a choose-N forget unreachable outside learn-time.
 */
export async function applyResourceOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ResourceOperation,
  batchId: string,
  sessionId: string | null,
  allowChooseNForget = false,
): Promise<ResourceOpAudit> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: RESOURCES_SELECT,
  });
  if (!row) throw new InvalidResourceOperationError(`Character not found: ${characterId}`);

  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  // One read, two consumers: deriveEntryScopedResources' edition-aware
  // derivation and the ctx.edition the cross-edition guard (#1345) checks a
  // client-supplied maneuverId/optionId against.
  const edition = editionOf(row);
  // Entry-scoped caps (#1177): a secondary Battle Master's maneuver cap must
  // come from THAT entry's own effective level, not the primary entry's.
  const { derived: derivedInfo } = deriveEntryScopedResources(
    row.classEntries,
    level,
    abilityScores,
    profBonus,
    edition,
    featureRowsOf,
  );

  const state = normalizeResourcesMutable(row.resources);
  const beforeState = snapshotResourcesState(state);
  const proficientSkills = proficientSkillsOf(row, state);

  const audit = await dispatchResourceOp(
    { tx, state, derivedInfo, characterId, batchId, sessionId, edition, allowChooseNForget, proficientSkills },
    op,
  );

  // Write the updated state back — always via serializeResourcesState so
  // all keys round-trip (prevents clobbering toolProficienciesKnown when
  // updating maneuversKnown and vice-versa).
  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const afterState = snapshotResourcesState(state);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: audit.eventType as Parameters<typeof logEvent>[1]["type"],
    summary: audit.summary,
    before: beforeState,
    after: afterState,
    data: audit.eventData,
    batchId,
    sessionId,
  });

  return audit;
}

/**
 * Applies a batch of resource operations atomically in one Prisma transaction.
 * Mirrors applySpellcastingOperations exactly:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - CharacterEvent logged per op with full before/after resource snapshot
 *     for revert symmetry with the HP/XP undo handler
 *   - state is re-read per op so a batch of multiple spends sees each prior result
 *
 * The scaffold's per-op row is only the existence check: applyResourceOpInTx
 * re-reads its own state via RESOURCES_SELECT so it composes under a caller tx.
 *
 * Returns one ResourceOpAudit per op (mirrors applyManeuverOperations) so the
 * route can surface roll/regen outcomes (e.g. rollInitiative's Focus-regen +
 * Uncanny Metabolism heal summary, #1243) for the client toast — most callers
 * (spendResource, learnManeuver, …) ignore it, same as before this return
 * type existed.
 */
export async function applyResourceOperations(
  characterId: string,
  operations: ResourceOperation[]
): Promise<ResourceOpAudit[]> {
  const results: ResourceOpAudit[] = [];
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidResourceOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      results.push(await applyResourceOpInTx(tx, id, op, batchId, sessionId));
    },
  });
  return results;
}

/**
 * Applies a single spendResource op inside a caller-supplied Prisma transaction.
 *
 * Exported so the actions orchestrator (actionsRouter) can include a
 * resource spend alongside an inventory adjust or HP heal in one atomic
 * $transaction. Thin spend-typed delegate over applyResourceOpInTx.
 */
export async function applySpendResourceInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: SpendResourceOperation,
  batchId: string,
  sessionId: string | null,
): Promise<ResourceOpAudit> {
  return applyResourceOpInTx(tx, characterId, op, batchId, sessionId);
}
