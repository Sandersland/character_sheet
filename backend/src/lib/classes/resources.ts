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

// status → the 400 the central `errorHandler` maps (client op-validation error).
export class InvalidResourceOperationError extends Error {
  status = 400;
}

// Canonical mutable state shape. Stored in Character.resources JSON column.
// `used`: resource key (string) → number of units currently spent.
// `maneuversKnown`: snapshot array of learned maneuvers; each entry has a
//   locally-generated `id` (the operation target), optional `maneuverId`
//   (catalog Maneuver.id provenance — null for custom maneuvers), and a
//   snapshot of name + description at learn time.

export interface ManeuverEntry {
  id: string;           // per-character entry UUID (operation target)
  maneuverId?: string;  // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
  // Session-UI routing snapshot from the catalog at learn time (undefined for
  // custom maneuvers → frontend defaults to "damageRoll").
  placement?: string;
  actionSlot?: string | null;
}

/**
 * A known elemental discipline (Way of the Four Elements). Mirrors ManeuverEntry.
 * learnedAtLevel/lastSwapLevel are recorded to support #397's one-swap-per-level
 * rule (2026-07-03 decision); lastSwapLevel is null until the entry is first swapped.
 */
export interface DisciplineEntry {
  id: string;              // per-character entry UUID (operation target)
  disciplineId?: string;   // catalog provenance — undefined for custom disciplines
  name: string;
  description: string;
  learnedAtLevel: number;
  lastSwapLevel: number | null;
}

/** A tool proficiency granted by a level-gated subclass feature (Student of War). */
export interface ToolProfEntry {
  id: string;   // per-character entry UUID (operation target)
  name: string; // matches a TOOLS entry name
}

/**
 * One picked option of a generic subclass "choose N" feature (#899) —
 * e.g. a Ranger's Hunter's Prey selection. Mirrors ManeuverEntry but carries
 * no mechanics: the option catalog is GrantedAbility rows, the selection is
 * just this snapshot. Stored under choicesKnown[choiceKey].
 */
export interface ChoiceEntry {
  id: string;         // per-character entry UUID (operation target)
  optionId?: string;  // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
}

/**
 * A structured mechanical effect defined on a catalog or custom feat.
 * Snapshot into AdvancementEntry.improvements at take-time so removal/derivation
 * never depend on the catalog row being present.
 *
 * Supported targets (enforced in advancement route, applied in serializeCharacter):
 *
 * Numeric (summed by deriveFeatBonuses, applied as additive bonuses):
 *   "initiative" | "speed" | "armorClass" | "maxHp"
 *
 * Keyed proficiency (collected by deriveFeatProficiencies, OR'd with stored proficiencies):
 *   "skillProficiency"       — imp.key = camelCase skill key e.g. "athletics" / "animalHandling"
 *   "savingThrowProficiency" — imp.key = ability name e.g. "strength"
 *
 * `perLevel`: when true, the effective bonus = amount × character's applied level
 * (hitDice.total). Only meaningful for numeric targets. Used by Tough (+2 HP per level).
 */
export interface FeatImprovement {
  target: string;
  amount: number;
  perLevel?: boolean;
  /** Required for keyed targets (skillProficiency, savingThrowProficiency). */
  key?: string;
  /** PHB'24: "proficiencyBonus" multiplies amount by PB at read time (e.g. Alert). */
  scaling?: "proficiencyBonus";
}

/**
 * One taken Ability Score Improvement or feat.
 * Stores the deltas applied so reversal subtracts exactly what was added —
 * never recomputes from ability scores, which may have changed since.
 */
// fallow-ignore-next-line code-duplication -- FeatImprovement/AdvancementEntry intentionally mirror the frontend wire types (types/character/leveling.ts); cross-workspace clone, shared-types consolidation is #820
export interface AdvancementEntry {
  id: string;                            // per-character entry UUID (operation target)
  level: number;                         // character level when taken (informational)
  kind: "asi" | "feat";
  /** PHB'24 Origin feat granted by a background (#1130): exempt from the ASI
   *  slot cap and never reversed on level-down; can't be removed via the route. */
  origin?: true;
  /** Fighting Style feat (#1137): consumes a `fightingStyle` slot, not an ASI
   *  slot. Absent ⇒ ASI-slot feat/ASI. Both partitions live in this one array. */
  slot?: "fightingStyle";
  /** The raw score increases applied: e.g. { strength: 2 } or { dexterity: 1, constitution: 1 } */
  abilityDeltas: Record<string, number>;
  /** HP added to hitPoints.max/current (CON-mod change × hitDice.total). */
  hpDelta: number;
  /** Addend applied to initiativeBonus (DEX-mod change). */
  initDelta: number;
  /** Catalog Feat.id provenance — undefined for ASI or custom feat. */
  featId?: string;
  /** Display name snapshot taken at time of choice (for feats). */
  featName?: string;
  /** Description snapshot taken at time of choice (for feats). */
  featDescription?: string;
  /**
   * Snapshot of the feat's structured mechanical effects at take-time.
   * Applied as a derived modifier layer in serializeCharacter / effective-max
   * computations — never persisted into separate columns.
   * Empty for ASI entries.
   */
  improvements?: FeatImprovement[];
}

export interface ResourcesMutableState {
  used: Record<string, number>;
  maneuversKnown: ManeuverEntry[];
  /** Level-gated elemental disciplines (Way of the Four Elements). */
  disciplinesKnown: DisciplineEntry[];
  /** Level-gated tool proficiency choices (currently: Student of War). */
  toolProficienciesKnown: ToolProfEntry[];
  /**
   * Generic subclass "choose N" selections (#899), keyed by SubclassChoice.key
   * (e.g. "huntersPrey"). Each list is capped at the level-derived count and
   * trimmed by reconcileSubclassChoices on level-down. A new choose-N feature
   * adds a subclass declaration + seed rows — no new state key here.
   */
  choicesKnown: Record<string, ChoiceEntry[]>;
  /** Ability Score Improvements and feats taken, in the order chosen. Fighting
   *  Style feats (#1137) live here tagged slot:"fightingStyle" — no separate key. */
  advancements: AdvancementEntry[];
}

// Subclass "choose N" cap policy: single-sourced level-gating for choicesKnown, shared by reconcile-on-write
// (trimChoicesToCaps) and clamp-on-read (buildResourcesPayload). Caps each key's
// list to its derived count (LIFO: keep the oldest picks); keys absent from
// `caps` (subclass/tier no longer grants them) get cap 0 and are dropped from
// `clamped`. `removedCount` is the total entries over cap.
export function clampChoicesToCaps(
  choicesKnown: Record<string, ChoiceEntry[]>,
  caps: Map<string, number>,
): { clamped: Record<string, ChoiceEntry[]>; removedCount: number } {
  const clamped: Record<string, ChoiceEntry[]> = {};
  let removedCount = 0;
  for (const [key, entries] of Object.entries(choicesKnown)) {
    const cap = caps.get(key) ?? 0;
    if (entries.length > cap) removedCount += entries.length - cap;
    if (cap > 0) clamped[key] = entries.slice(0, cap);
  }
  return { clamped, removedCount };
}

// Single source of the ASI-slot cap policy (#1130/#1137), shared by every
// clamp-on-read and reconcile-on-write site. Three partitions in one array:
// Origin feats (background grants) are always kept and consume no slot; Fighting
// Style feats (slot "fightingStyle", #1137) keep the earliest `fightingStyleSlotTotal`
// against their OWN cap; every other ASI/feat keeps the earliest `slotTotal`. Each
// partition trims LIFO (the tail beyond its cap becomes `excess`). `kept` preserves
// the original order; `usedSlots`/`usedFightingStyleSlots` count the kept
// slot-consuming entries of each partition. fightingStyleSlotTotal defaults to
// Infinity so non-reconcile callers (HP/concentration feat-bonus reads) keep every
// fs feat without trimming — only the serialize clamp + reconciler pass the real cap.
export function splitAdvancementsBySlotCap(
  advancements: AdvancementEntry[],
  slotTotal: number,
  fightingStyleSlotTotal = Number.POSITIVE_INFINITY,
): { kept: AdvancementEntry[]; excess: AdvancementEntry[]; usedSlots: number; usedFightingStyleSlots: number } {
  const kept: AdvancementEntry[] = [];
  const excess: AdvancementEntry[] = [];
  let usedSlots = 0;
  let usedFightingStyleSlots = 0;
  for (const entry of advancements) {
    if (entry.origin) {
      kept.push(entry);
    } else if (entry.slot === "fightingStyle") {
      if (usedFightingStyleSlots < fightingStyleSlotTotal) {
        kept.push(entry);
        usedFightingStyleSlots++;
      } else {
        excess.push(entry);
      }
    } else if (usedSlots < slotTotal) {
      kept.push(entry);
      usedSlots++;
    } else {
      excess.push(entry);
    }
  }
  return { kept, excess, usedSlots, usedFightingStyleSlots };
}

// Normalizer: tolerant of null (character has never used any resources) and future schema
// additions. Mirror of normalizeSpellcastingMutable.

export function normalizeResourcesMutable(json: Prisma.JsonValue): ResourcesMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {
      used: {},
      maneuversKnown: [],
      disciplinesKnown: [],
      toolProficienciesKnown: [],
      choicesKnown: {},
      advancements: [],
    };
  }
  const obj = json as Record<string, unknown>;
  const rawChoices = obj.choicesKnown;
  const choicesKnown: Record<string, ChoiceEntry[]> =
    rawChoices && typeof rawChoices === "object" && !Array.isArray(rawChoices)
      ? (rawChoices as Record<string, ChoiceEntry[]>)
      : {};
  return {
    used: (obj.used as Record<string, number>) ?? {},
    maneuversKnown: (obj.maneuversKnown as ManeuverEntry[]) ?? [],
    disciplinesKnown: (obj.disciplinesKnown as DisciplineEntry[]) ?? [],
    toolProficienciesKnown: (obj.toolProficienciesKnown as ToolProfEntry[]) ?? [],
    choicesKnown,
    advancements: (obj.advancements as AdvancementEntry[]) ?? [],
  };
}

/**
 * Serializes the full mutable resource state to the shape written to
 * Character.resources. Route every update through this helper so all keys
 * round-trip — required now that multiple level-gated lists share one column.
 */
export function serializeResourcesState(state: ResourcesMutableState): Prisma.InputJsonValue {
  return {
    used: state.used,
    maneuversKnown: state.maneuversKnown,
    disciplinesKnown: state.disciplinesKnown,
    toolProficienciesKnown: state.toolProficienciesKnown,
    choicesKnown: state.choicesKnown,
    advancements: state.advancements,
  } as unknown as Prisma.InputJsonValue;
}

/**
 * Canonical deep-clone of the COMPLETE resources audit-snapshot shape — the one
 * source of truth for every before/after event snapshot, so no field can be
 * omitted per-site (the undo handlers restore before.resources wholesale, so an
 * omitted key silently wipes on revert). Copies every entry, so mutating `state`
 * after capture can't retroactively alter the snapshot.
 */
export function snapshotResources(state: ResourcesMutableState): ResourcesMutableState {
  return {
    used: { ...state.used },
    maneuversKnown: state.maneuversKnown.map((m) => ({ ...m })),
    disciplinesKnown: state.disciplinesKnown.map((d) => ({ ...d })),
    toolProficienciesKnown: state.toolProficienciesKnown.map((t) => ({ ...t })),
    choicesKnown: Object.fromEntries(
      Object.entries(state.choicesKnown).map(([key, entries]) => [key, entries.map((e) => ({ ...e }))]),
    ),
    advancements: state.advancements.map((a) => ({
      ...a,
      abilityDeltas: { ...a.abilityDeltas },
      // Shallow-copy the improvements array so a later mutation of state can't
      // retroactively alter this snapshot; its FeatImprovement elements are
      // treated as immutable snapshots.
      improvements: a.improvements ? [...a.improvements] : undefined,
    })),
  };
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
// returns the audit payload the dispatcher writes to the event log. Kept
// module-private so the public API (applyResourceOperations) stays byte-stable.

interface ResourceOpAudit {
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

  const audit = await dispatchResourceOp({ tx, state, derivedInfo, disciplineLevel }, op);

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
 */
export async function applyResourceOperations(
  characterId: string,
  operations: ResourceOperation[]
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidResourceOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, op, characterId: id, batchId, sessionId }) => {
      await applyResourceOpInTx(tx, id, op, batchId, sessionId);
    },
  });
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
