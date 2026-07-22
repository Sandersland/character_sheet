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
import { toolsByCategory } from "@/lib/srd/srd.js";
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
  type DisciplineEntry,
  type FeatImprovement,
  type ManeuverEntry,
  type ResourcesMutableState,
  type ToolProfEntry,
} from "./resources-state.js";

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
  DisciplineEntry,
  FeatImprovement,
  ManeuverEntry,
  ResourcesMutableState,
  ToolProfEntry,
};

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidResourceOperationError extends Error {
  status = 400;
}

/** Spend one or more units of a trackable resource (e.g. a superiority die). */
export interface SpendResourceOperation {
  type: "spendResource";
  key: string;     // resource key, e.g. "superiorityDice"
  amount?: number; // default 1
  /** Client-rolled die value (for superiority dice) — logged but not validated. */
  roll?: number;
}

/** Restore one or more units of a spent resource (undo mis-click or Relentless). */
export interface RestoreResourceOperation {
  type: "restoreResource";
  key: string;
  amount?: number; // default 1
}

/**
 * Roll Initiative / combat start (#1239). Applies EVERY derived pool's
 * `onInitiative` regen at once — a single combat-start event, so it carries no
 * key. Inert for characters whose pools declare no onInitiative descriptor.
 */
export interface RollInitiativeOperation {
  type: "rollInitiative";
}

/** Learn a maneuver from catalog (maneuverId) or add a custom one. */
export interface LearnManeuverOperation {
  type: "learnManeuver";
  maneuverId?: string;  // catalog Maneuver.id
  custom?: { name: string; description: string };
}

/** Remove a known maneuver by its per-character entry id. */
export interface ForgetManeuverOperation {
  type: "forgetManeuver";
  entryId: string;
}

/** Learn an elemental discipline from catalog (disciplineId) or add a custom one. */
export interface LearnDisciplineOperation {
  type: "learnDiscipline";
  disciplineId?: string; // catalog Discipline.id
  custom?: { name: string; description: string; minLevel?: number };
}

/** Remove a known elemental discipline by its per-character entry id. */
export interface ForgetDisciplineOperation {
  type: "forgetDiscipline";
  entryId: string;
}

/**
 * Swap (retrain) one known discipline for another within the cap. Gated to one
 * swap per monk level via the lastSwapLevel marker. Replaces the entry in place.
 */
export interface SwapDisciplineOperation {
  type: "swapDiscipline";
  entryId: string;       // the known discipline to replace
  disciplineId?: string; // catalog Discipline.id of the replacement
  custom?: { name: string; description: string; minLevel?: number };
}

/**
 * Learn an artisan's-tool proficiency from the Student of War feature.
 * `name` must match a TOOLS entry with category "artisan".
 */
export interface LearnToolProficiencyOperation {
  type: "learnToolProficiency";
  name: string; // must match TOOLS[].name where category === "artisan"
}

/** Remove a subclass-granted tool proficiency by its per-character entry id. */
export interface ForgetToolProficiencyOperation {
  type: "forgetToolProficiency";
  entryId: string;
}

/**
 * Pick an option for a generic subclass "choose N" feature (#899) — from the
 * catalog (optionId) or a custom entry. `choiceKey` selects which declared
 * choice (e.g. "huntersPrey"); the option must belong to that choice's catalog
 * source and stay within the level-derived count.
 */
export interface LearnSubclassChoiceOperation {
  type: "learnSubclassChoice";
  choiceKey: string;
  optionId?: string; // catalog GrantedAbility.id
  custom?: { name: string; description: string };
}

/** Remove a picked subclass-choice option by its per-character entry id. */
export interface ForgetSubclassChoiceOperation {
  type: "forgetSubclassChoice";
  choiceKey: string;
  entryId: string;
}

export type ResourceOperation =
  | SpendResourceOperation
  | RestoreResourceOperation
  | RollInitiativeOperation
  | LearnManeuverOperation
  | ForgetManeuverOperation
  | LearnDisciplineOperation
  | ForgetDisciplineOperation
  | SwapDisciplineOperation
  | LearnToolProficiencyOperation
  | ForgetToolProficiencyOperation
  | LearnSubclassChoiceOperation
  | ForgetSubclassChoiceOperation;

// Per-op appliers: each validates + mutates `state` in place (throwing on any illegal op) and
// returns the audit payload the dispatcher writes to the event log.

// Exported (#1243) so routes/character/resources.ts can type its `respond`
// override that surfaces per-op results (e.g. rollInitiative's regen summary)
// to the client, mirroring ManeuverCastResult.
export interface ResourceOpAudit {
  eventType: string;
  summary: string;
  eventData: Record<string, unknown>;
}

function applySpendResourceOp(
  state: ResourcesMutableState,
  op: SpendResourceOperation,
  derivedInfo: DerivedClassInfo | null,
): ResourceOpAudit {
  const amount = op.amount ?? 1;
  if (amount <= 0) {
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

function applyOneInitiativeDescriptor(
  state: ResourcesMutableState,
  pool: DerivedResource,
  regen: InitiativeRegen,
  discriminator: string | number,
): InitiativeRegenResult | null {
  if (!markerAllowsFiring(state, pool, regen, discriminator)) return null;
  const used = state.used[pool.key] ?? 0;
  const targetUsed = regenTargetUsed(pool, regen, used);
  const restored = targetUsed < used ? used - targetUsed : 0;
  if (restored > 0) state.used[pool.key] = targetUsed;
  if (restored === 0 && !regen.bonusHeal) return null;
  return {
    key: pool.key,
    label: pool.label,
    restored,
    remaining: pool.total - (state.used[pool.key] ?? 0),
    ...(regen.bonusHeal ? { bonusHeal: regen.bonusHeal } : {}),
  };
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

function applyForgetManeuverOp(
  state: ResourcesMutableState,
  op: ForgetManeuverOperation,
): ResourceOpAudit {
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

// Resolve a discipline op's target (catalog or custom) to a snapshot, enforcing
// catalog/custom exclusivity, catalog existence, always-known status, and the
// per-discipline min monk level. Shared by learn + swap.
async function resolveDiscipline(
  tx: Prisma.TransactionClient,
  op: { disciplineId?: string; custom?: { name: string; description: string; minLevel?: number } },
  level: number,
): Promise<{ disciplineId?: string; name: string; description: string }> {
  if (Boolean(op.disciplineId) === Boolean(op.custom)) {
    throw new InvalidResourceOperationError(
      "discipline op: provide exactly one of disciplineId or custom"
    );
  }
  if (op.disciplineId) {
    const catalog = await tx.grantedAbility.findUnique({ where: { id: op.disciplineId } });
    if (!catalog || catalog.source !== "discipline") {
      throw new InvalidResourceOperationError(`Discipline not found in catalog: ${op.disciplineId}`);
    }
    if (catalog.alwaysKnown) {
      throw new InvalidResourceOperationError(
        `${catalog.name} is always known and cannot be learned or swapped`
      );
    }
    if (level < catalog.minLevel) {
      throw new InvalidResourceOperationError(
        `Cannot learn ${catalog.name}: requires monk level ${catalog.minLevel} (currently ${level})`
      );
    }
    return { disciplineId: catalog.id, name: catalog.name, description: catalog.description };
  }
  const custom = op.custom!;
  const minLevel = custom.minLevel ?? 3;
  if (level < minLevel) {
    throw new InvalidResourceOperationError(
      `Cannot learn ${custom.name}: requires monk level ${minLevel} (currently ${level})`
    );
  }
  return { name: custom.name, description: custom.description };
}

async function applyLearnDisciplineOp(
  tx: Prisma.TransactionClient,
  state: ResourcesMutableState,
  op: LearnDisciplineOperation,
  derivedInfo: DerivedClassInfo | null,
  level: number,
): Promise<ResourceOpAudit> {
  const choiceCount = derivedInfo?.disciplineChoiceCount;
  if (choiceCount !== undefined && state.disciplinesKnown.length >= choiceCount) {
    throw new InvalidResourceOperationError(
      `Cannot learn more disciplines: already know ${state.disciplinesKnown.length}/${choiceCount}`
    );
  }
  const resolved = await resolveDiscipline(tx, op, level);
  if (resolved.disciplineId && state.disciplinesKnown.some((d) => d.disciplineId === resolved.disciplineId)) {
    throw new InvalidResourceOperationError(
      `Discipline already known (disciplineId: ${resolved.disciplineId})`
    );
  }
  const newEntry: DisciplineEntry = {
    id: randomUUID(),
    disciplineId: resolved.disciplineId,
    name: resolved.name,
    description: resolved.description,
    learnedAtLevel: level,
    lastSwapLevel: null,
  };
  state.disciplinesKnown.push(newEntry);
  return {
    eventType: "learnDiscipline",
    summary: `Learned discipline: ${newEntry.name}`,
    eventData: {
      entryId: newEntry.id,
      disciplineName: newEntry.name,
      disciplineId: newEntry.disciplineId ?? null,
    },
  };
}

function applyForgetDisciplineOp(
  state: ResourcesMutableState,
  op: ForgetDisciplineOperation,
): ResourceOpAudit {
  const idx = state.disciplinesKnown.findIndex((d) => d.id === op.entryId);
  if (idx === -1) {
    throw new InvalidResourceOperationError(`Discipline entry not found: ${op.entryId}`);
  }
  const forgotten = state.disciplinesKnown[idx];
  state.disciplinesKnown.splice(idx, 1);
  return {
    eventType: "forgetDiscipline",
    summary: `Forgot discipline: ${forgotten.name}`,
    eventData: { entryId: op.entryId, disciplineName: forgotten.name },
  };
}

async function applySwapDisciplineOp(
  tx: Prisma.TransactionClient,
  state: ResourcesMutableState,
  op: SwapDisciplineOperation,
  level: number,
): Promise<ResourceOpAudit> {
  const idx = state.disciplinesKnown.findIndex((d) => d.id === op.entryId);
  if (idx === -1) {
    throw new InvalidResourceOperationError(`Discipline entry not found: ${op.entryId}`);
  }
  // One retraining swap per monk level.
  if (state.disciplinesKnown.some((d) => d.lastSwapLevel === level)) {
    throw new InvalidResourceOperationError(
      `Already swapped a discipline at monk level ${level} — swap again after leveling up`
    );
  }
  const resolved = await resolveDiscipline(tx, op, level);
  if (
    resolved.disciplineId &&
    state.disciplinesKnown.some((d, i) => i !== idx && d.disciplineId === resolved.disciplineId)
  ) {
    throw new InvalidResourceOperationError(
      `Discipline already known (disciplineId: ${resolved.disciplineId})`
    );
  }
  const previous = state.disciplinesKnown[idx];
  const replacement: DisciplineEntry = {
    id: randomUUID(),
    disciplineId: resolved.disciplineId,
    name: resolved.name,
    description: resolved.description,
    learnedAtLevel: previous.learnedAtLevel,
    lastSwapLevel: level,
  };
  state.disciplinesKnown[idx] = replacement;
  return {
    eventType: "swapDiscipline",
    summary: `Swapped discipline: ${previous.name} → ${replacement.name}`,
    eventData: {
      entryId: replacement.id,
      replacedEntryId: op.entryId,
      fromName: previous.name,
      toName: replacement.name,
      disciplineId: replacement.disciplineId ?? null,
    },
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

// Generic subclass "choose N" appliers (#899): validate against the level-derived subclassChoices declaration: the choice
// must be available at this level/subclass, the option must belong to the
// choice's catalog source, and the pick must stay within the derived count.

// Resolve a subclass-choice op's target (catalog optionId or custom) to a new
// ChoiceEntry, enforcing catalog membership + dedup. Shared shape with
// resolveDiscipline; keeps applyLearnSubclassChoiceOp under the complexity bar.
async function resolveChoiceOption(
  tx: Prisma.TransactionClient,
  op: LearnSubclassChoiceOperation,
  choice: NonNullable<DerivedClassInfo["subclassChoices"]>[number],
  known: ChoiceEntry[],
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
  return { id: randomUUID(), optionId: option.id, name: option.name, description: option.description };
}

async function applyLearnSubclassChoiceOp(
  tx: Prisma.TransactionClient,
  state: ResourcesMutableState,
  op: LearnSubclassChoiceOperation,
  derivedInfo: DerivedClassInfo | null,
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

  const newEntry = await resolveChoiceOption(tx, op, choice, known);
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

function applyForgetSubclassChoiceOp(
  state: ResourcesMutableState,
  op: ForgetSubclassChoiceOperation,
): ResourceOpAudit {
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
  /** The discipline-granting entry's own effective level (#1177) — only the
   *  learnDiscipline/swapDiscipline handlers read this. */
  disciplineLevel: number;
  /** Only rollInitiative reads these — its bonusHeal composes applyHealInTx
   *  in the same tx/batch (#1243). */
  characterId: string;
  batchId: string;
  sessionId: string | null;
}

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
  learnManeuver: (ctx, op) => applyLearnManeuverOp(ctx.tx, ctx.state, op, ctx.derivedInfo),
  forgetManeuver: (ctx, op) => applyForgetManeuverOp(ctx.state, op),
  learnDiscipline: (ctx, op) => applyLearnDisciplineOp(ctx.tx, ctx.state, op, ctx.derivedInfo, ctx.disciplineLevel),
  forgetDiscipline: (ctx, op) => applyForgetDisciplineOp(ctx.state, op),
  swapDiscipline: (ctx, op) => applySwapDisciplineOp(ctx.tx, ctx.state, op, ctx.disciplineLevel),
  learnToolProficiency: (ctx, op) => applyLearnToolProficiencyOp(ctx.state, op, ctx.derivedInfo),
  forgetToolProficiency: (ctx, op) => applyForgetToolProficiencyOp(ctx.state, op),
  learnSubclassChoice: (ctx, op) => applyLearnSubclassChoiceOp(ctx.tx, ctx.state, op, ctx.derivedInfo),
  forgetSubclassChoice: (ctx, op) => applyForgetSubclassChoiceOp(ctx.state, op),
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
const RESOURCES_SELECT = {
  resources: true,
  experiencePoints: true,
  abilityScores: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclass: true, level: true },
  },
} satisfies Prisma.CharacterSelect;

/**
 * Applies one resource op inside a caller-supplied transaction/batchId, so the
 * unified level-up endpoint (#885) and the actions orchestrator can compose a
 * resource change with other domains under one batchId. Reads fresh state via
 * `tx` on every call (a batch of spends sees each prior result), dispatches via
 * dispatchResourceOp → writes back → logs its own event (the single copy of the
 * logic; applySpendResourceInTx is a thin, spend-typed delegate over this).
 */
export async function applyResourceOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ResourceOperation,
  batchId: string,
  sessionId: string | null,
): Promise<ResourceOpAudit> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: RESOURCES_SELECT,
  });
  if (!row) throw new InvalidResourceOperationError(`Character not found: ${characterId}`);

  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  // Entry-scoped caps (#1177): a secondary Battle Master's maneuver cap and a
  // secondary Four Elements monk's discipline gate must come from THAT entry's
  // own effective level, not the primary entry's.
  const { derived: derivedInfo, disciplineLevel } = deriveEntryScopedResources(
    row.classEntries,
    level,
    abilityScores,
    profBonus,
  );

  const state = normalizeResourcesMutable(row.resources);
  const beforeState = snapshotResourcesState(state);

  const audit = await dispatchResourceOp({ tx, state, derivedInfo, disciplineLevel, characterId, batchId, sessionId }, op);

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
