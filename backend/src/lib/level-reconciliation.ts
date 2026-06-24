/**
 * Level-gated feature reconciliation — the single call site for repairing
 * persisted state that exceeds what the character's current level allows.
 *
 * ## Pattern
 *
 * Two complementary layers keep level-gated state honest:
 *
 *   1. **Reconcile-on-write** (this module): runs inside the XP transaction
 *      whenever XP changes. Each reconciler compares persisted state to the
 *      level-derived limit, trims/clears any excess, and logs an auditable
 *      event so the change is visible on the timeline and undoable.
 *
 *   2. **Clamp-on-read** (serializeCharacter in routes/characters.ts): non-
 *      destructive fallback that caps displayed values to the derived limit so
 *      characters already in an invalid state render correctly before their
 *      next XP op triggers the write-side reconciliation.
 *
 * ## Adding a new level-gated feature
 *
 * 1. Write a `Reconciler` function in this file.
 * 2. Add it to `LEVEL_GATED_RECONCILERS` (order matters — later reconcilers
 *    see results of earlier ones; maneuvers must run after subclass).
 * 3. Add a matching clamp-on-read in serializeCharacter.
 * 4. Add new EventType values as needed (schema.prisma + events.ts + migrate).
 *
 * Future slots: `reconcileFeats`, `reconcileAbilityImprovements`.
 */

import { Prisma } from "../generated/prisma/client.js";
import { proficiencyBonusForLevel } from "./experience.js";
import { logEvent } from "./events.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  type AdvancementEntry,
  type ManeuverEntry,
  type ToolProfEntry,
} from "./resources.js";
import { advancementSlotsForLevel, fightingStyleChoiceCount, FIGHTING_STYLES } from "./srd.js";
import { deriveResources } from "./class-features.js";
import { reverseAdvancementEffects } from "./advancement.js";
import { normalizeHitPoints } from "./hitpoints.js";

// ── Reconcile context ─────────────────────────────────────────────────────────

export interface ReconcileContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  /** XP-derived level after the current operation — the new authority. */
  newDerivedLevel: number;
  batchId: string;
}

type Reconciler = (ctx: ReconcileContext) => Promise<void>;

// ── reconcileSubclass ─────────────────────────────────────────────────────────
// Moved from experience-ops.ts (was clearStaleSubclass). Unchanged behavior:
// clears the subclass choice on the primary class entry whenever the XP-derived
// level drops below the class's subclassLevel. Must run first so maneuver
// reconciliation sees the already-cleared subclass.

async function reconcileSubclass(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: {
          id: true,
          subclass: true,
          subclassId: true,
          class: { select: { subclassLevel: true } },
        },
      },
    },
  });

  const entry = character?.classEntries[0];
  if (!entry) return;
  if (entry.subclass === null && entry.subclassId === null) return;

  const subclassLevel = entry.class?.subclassLevel ?? 3;
  if (newDerivedLevel >= subclassLevel) return;

  // Level has fallen below the grant level — clear the subclass choice.
  await tx.characterClassEntry.update({
    where: { id: entry.id },
    data: { subclassId: null, subclass: null },
  });

  await logEvent(tx, {
    characterId,
    category: "class",
    type: "subclassRemoved",
    summary: `Subclass "${entry.subclass ?? entry.subclassId}" removed (level dropped below ${subclassLevel})`,
    before: { subclassId: entry.subclassId ?? null, subclass: entry.subclass ?? null },
    after: { subclassId: null, subclass: null },
    data: { classEntryId: entry.id },
    batchId,
  });
}

// ── reconcileManeuvers ────────────────────────────────────────────────────────
// Trims the persisted maneuversKnown array when the level-derived choice count
// has decreased. Runs AFTER reconcileSubclass so an already-cleared subclass
// produces allowed=0 (deriveResources returns null → maneuverChoiceCount
// undefined → allowed 0 → all maneuvers removed).
//
// Keeps the oldest entries (LIFO: drop the most-recently-learned), consistent
// with the app's LIFO-undo model and the read-clamp's slice(0, n) behavior.
//
// Uses a `resources`-category event so the existing undo branch in activity.ts
// (lines 197-206) restores the full before.resources JSON with no new undo code.

async function reconcileManeuvers(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true, subclass: true },
      },
    },
  });
  if (!row) return;

  const state = normalizeResourcesMutable(row.resources);
  if (state.maneuversKnown.length === 0) return; // nothing to trim

  const abilityScores = row.abilityScores as Record<string, number>;
  const profBonus = proficiencyBonusForLevel(newDerivedLevel);
  const primaryEntry = row.classEntries[0];
  const derived = deriveResources(
    primaryEntry?.name ?? "",
    primaryEntry?.subclass ?? undefined,
    newDerivedLevel,
    abilityScores,
    profBonus,
  );

  // allowed = 0 when subclass is cleared (derived is null) or below grant level.
  const allowed = derived?.maneuverChoiceCount ?? 0;

  if (state.maneuversKnown.length <= allowed) return; // within cap, no action needed

  const before = {
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
    },
  };

  const trimmed = state.maneuversKnown.slice(0, allowed);
  const removedCount = state.maneuversKnown.length - allowed;

  // Update the maneuversKnown slice while preserving toolProficienciesKnown.
  state.maneuversKnown = trimmed;
  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const after = {
    resources: {
      used: { ...state.used },
      maneuversKnown: trimmed.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
    },
  };

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "maneuversReconciled",
    summary:
      allowed === 0
        ? `All ${removedCount} maneuver${removedCount > 1 ? "s" : ""} removed — subclass no longer available`
        : `${removedCount} maneuver${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed}`,
    before,
    after,
    data: { removedCount, allowed },
    batchId,
  });
}

// ── reconcileToolProficiencies ────────────────────────────────────────────────
// Trims toolProficienciesKnown when the subclass no longer grants a tool choice
// (character leveled down below 3, or subclass was cleared). Like
// reconcileManeuvers, runs AFTER reconcileSubclass for the same reason: a
// cleared subclass produces allowed=0 so all level-gated tool profs are removed.
//
// Uses a `resources`-category event → undo is free (activity.ts restores
// before.resources wholesale). Only creation-fixed tool profs (stored in
// Character.toolProficiencies) are untouched — they are never in this array.

async function reconcileToolProficiencies(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true, subclass: true },
      },
    },
  });
  if (!row) return;

  const state = normalizeResourcesMutable(row.resources);
  if (state.toolProficienciesKnown.length === 0) return; // nothing to trim

  const abilityScores = row.abilityScores as Record<string, number>;
  const profBonus = proficiencyBonusForLevel(newDerivedLevel);
  const primaryEntry = row.classEntries[0];
  const derived = deriveResources(
    primaryEntry?.name ?? "",
    primaryEntry?.subclass ?? undefined,
    newDerivedLevel,
    abilityScores,
    profBonus,
  );

  // allowed = 0 when subclass is cleared or character is below grant level.
  const allowed = derived?.toolProfChoiceCount ?? 0;

  if (state.toolProficienciesKnown.length <= allowed) return;

  const before = {
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
    },
  };

  const trimmed = state.toolProficienciesKnown.slice(0, allowed);
  const removedCount = state.toolProficienciesKnown.length - allowed;

  state.toolProficienciesKnown = trimmed;
  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const after = {
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: trimmed.map((t: ToolProfEntry) => ({ ...t })),
    },
  };

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "toolProficienciesReconciled",
    summary:
      allowed === 0
        ? `${removedCount} tool proficiency choice${removedCount > 1 ? "s" : ""} removed — subclass no longer available`
        : `${removedCount} tool proficiency choice${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed}`,
    before,
    after,
    data: { removedCount, allowed },
    batchId,
  });
}

// ── reconcileFightingStyle ────────────────────────────────────────────────────
// Clears the persisted fighting style when the character is no longer entitled
// to one at the new level (e.g. a class change away from Fighter via the data —
// fightingStyleChoiceCount drops to 0). Fighter keeps its choice at every level
// >= 1, so for a pure single-class Fighter this only fires on a class change.
//
// Uses a `resources`-category event so the undo branch in activity.ts restores
// before.resources wholesale (incl. fightingStyle) — no new undo code. The
// clamp-on-read mirror lives in serializeCharacter.

async function reconcileFightingStyle(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true },
      },
    },
  });
  if (!row) return;

  const state = normalizeResourcesMutable(row.resources);
  if (state.fightingStyle === null) return; // nothing chosen

  const className = row.classEntries[0]?.name ?? "";
  const allowed = fightingStyleChoiceCount(className, newDerivedLevel);
  if (allowed > 0) return; // still entitled — keep the choice

  const before = {
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
      fightingStyle: state.fightingStyle,
    },
  };

  const removedKey = state.fightingStyle;
  const removedLabel = FIGHTING_STYLES.find((s) => s.key === removedKey)?.label ?? removedKey;
  state.fightingStyle = null;

  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const after = {
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
      fightingStyle: null,
    },
  };

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "fightingStyleRemoved",
    summary: `Fighting style "${removedLabel}" removed — no longer available`,
    before,
    after,
    data: { fightingStyle: removedKey },
    batchId,
  });
}

// ── reconcileAdvancements ─────────────────────────────────────────────────────
// Reverses the tail of advancements[] when the XP-derived level has fallen
// below the level required for those slots (i.e. character leveled down past
// an ASI level). Uses LIFO: the most-recently-taken advancements are removed
// first. Reversal subtracts the stored deltas from abilityScores, hitPoints,
// and initiativeBonus rather than recomputing — ensuring exactness even if
// other ops have changed these columns since.
//
// Order-independent of reconcileSubclass/Maneuvers — ASI slots are class-level-
// gated, not subclass-gated, so they can safely run last.
//
// Uses `advancement` category events so the undo branch in activity.ts restores
// abilityScores + hitPoints + initiativeBonus + resources in one shot.

async function reconcileAdvancements(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      abilityScores: true,
      hitPoints: true,
      hitDice: true,
      initiativeBonus: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        take: 1,
        select: { name: true },
      },
    },
  });
  if (!row) return;

  const state = normalizeResourcesMutable(row.resources);
  if (state.advancements.length === 0) return; // nothing to trim

  const className = row.classEntries[0]?.name ?? "";
  const allowed = advancementSlotsForLevel(className, newDerivedLevel);

  if (state.advancements.length <= allowed) return; // within cap

  const scores = row.abilityScores as Record<string, number>;
  const hp = normalizeHitPoints(row.hitPoints);
  const initBonus = row.initiativeBonus;

  // Snapshot before (for undo).
  const before = {
    abilityScores: { ...scores },
    hitPoints: { ...hp, deathSaves: { ...hp.deathSaves } },
    initiativeBonus: initBonus,
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
      advancements: state.advancements.map((a: AdvancementEntry) => ({
        ...a,
        abilityDeltas: { ...a.abilityDeltas },
      })),
    },
  };

  // LIFO: reverse the tail entries (those beyond the new cap).
  const toRemove = state.advancements.slice(allowed);
  const removedCount = toRemove.length;

  const reversed = reverseAdvancementEffects(scores, hp, initBonus, toRemove);
  state.advancements = state.advancements.slice(0, allowed);

  const newHp = {
    ...reversed.hitPoints,
    current: Math.min(reversed.hitPoints.current, reversed.hitPoints.max),
  };

  await tx.character.update({
    where: { id: characterId },
    data: {
      abilityScores: reversed.scores as Prisma.InputJsonValue,
      hitPoints: newHp as Prisma.InputJsonValue,
      initiativeBonus: reversed.initiativeBonus,
      resources: serializeResourcesState(state),
    },
  });

  const after = {
    abilityScores: { ...reversed.scores },
    hitPoints: { ...newHp, deathSaves: { ...newHp.deathSaves } },
    initiativeBonus: reversed.initiativeBonus,
    resources: {
      used: { ...state.used },
      maneuversKnown: state.maneuversKnown.map((m: ManeuverEntry) => ({ ...m })),
      toolProficienciesKnown: state.toolProficienciesKnown.map((t: ToolProfEntry) => ({ ...t })),
      advancements: state.advancements.map((a: AdvancementEntry) => ({
        ...a,
        abilityDeltas: { ...a.abilityDeltas },
      })),
    },
  };

  const removedLabels = toRemove
    .map((a) =>
      a.kind === "feat"
        ? (a.featName ?? "Custom feat")
        : Object.entries(a.abilityDeltas)
            .map(([ab, d]) => `${ab} +${d}`)
            .join(", "),
    )
    .join("; ");

  await logEvent(tx, {
    characterId,
    category: "advancement",
    type: "advancementsReconciled",
    summary:
      allowed === 0
        ? `${removedCount} advancement${removedCount > 1 ? "s" : ""} removed — level dropped below first ASI level`
        : `${removedCount} advancement${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed} (removed: ${removedLabels})`,
    before,
    after,
    data: { removedCount, allowed },
    batchId,
  });
}

// ── Registry + orchestrator ───────────────────────────────────────────────────

/**
 * Ordered list of reconcilers. Each runs sequentially in the XP transaction
 * (later reconcilers see earlier ones' results — maneuvers must follow subclass).
 */
const LEVEL_GATED_RECONCILERS: Reconciler[] = [
  reconcileSubclass,
  reconcileManeuvers,
  reconcileToolProficiencies,
  reconcileFightingStyle,
  reconcileAdvancements,
];

/**
 * Runs all level-gated feature reconcilers inside an existing transaction.
 * Call this once per XP operation in applyExperienceOperations, after the
 * XP value and derived level are committed.
 */
export async function reconcileLevelGatedState(ctx: ReconcileContext): Promise<void> {
  for (const reconcile of LEVEL_GATED_RECONCILERS) {
    await reconcile(ctx);
  }
}
