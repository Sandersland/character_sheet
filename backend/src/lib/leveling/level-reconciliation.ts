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
 *   2. **Clamp-on-read** (serializeCharacter in lib/character/character-serialize.ts): non-
 *      destructive fallback that caps displayed values to the derived limit so
 *      characters already in an invalid state render correctly before their
 *      next XP op triggers the write-side reconciliation.
 *
 * ## Adding a new level-gated feature
 *
 * 1. Write a `Reconciler` function in this file. If the feature is a "known"
 *    list in Character.resources trimmed by a level-derived choice count,
 *    write it as a thin `reconcileKnownList` config instead of hand-rolling.
 * 2. Add it to `LEVEL_GATED_RECONCILERS` (order matters — later reconcilers
 *    see results of earlier ones; maneuvers must run after subclass).
 * 3. Add a matching clamp-on-read in serializeCharacter.
 * 4. Add new EventType values as needed (schema.prisma + events.ts + migrate).
 *
 * Feats and Ability Score Improvements ship via `reconcileAdvancements`.
 */

import { Prisma } from "@/generated/prisma/client.js";
import { proficiencyBonusForLevel } from "./experience.js";
import { logEvent, type EventType } from "@/lib/activity/events.js";
import {
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  type DisciplineEntry,
  type ManeuverEntry,
  type ResourcesMutableState,
  type ToolProfEntry,
} from "@/lib/classes/resources.js";
import { advancementSlotsForLevel, fightingStyleChoiceCount, FIGHTING_STYLES } from "@/lib/srd/srd.js";
import { deriveResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { reverseAdvancementEffects } from "./advancement.js";
import { normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { deriveGrantedSpells } from "@/lib/spellcasting/granted-spells.js";

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
// Clears a subclass choice on ANY class entry whose effective level has dropped
// below that class's subclassLevel. Per-entry (issue #125): a multiclass
// character picks a subclass per class at that class's own grant level, so each
// entry is checked against its per-class level. For a single-class character the
// per-class level column can be stale (self-healed lazily by the HP level-up),
// so the XP-derived total is authoritative there. Runs first (after class-level
// reconciliation) so maneuver/tool reconcilers see the already-cleared subclass.

async function reconcileSubclass(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const entries = await tx.characterClassEntry.findMany({
    where: { characterId },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      level: true,
      subclass: true,
      subclassId: true,
      class: { select: { subclassLevel: true } },
    },
  });

  const singleClass = entries.length <= 1;

  for (const entry of entries) {
    if (entry.subclass === null && entry.subclassId === null) continue;

    const subclassLevel = entry.class?.subclassLevel ?? 3;
    const effectiveLevel = singleClass ? newDerivedLevel : entry.level;
    if (effectiveLevel >= subclassLevel) continue;

    // Level has fallen below the grant level — clear this entry's subclass.
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
}

// ── reconcileGrantedSpells ────────────────────────────────────────────────────
// Defense-in-depth: subclass-granted spells are pure-derived at read time and
// never persisted in the happy path, so this only fires if a source:"subclass"
// entry ever leaks into the stored spells[]. It strips any leaked grant no longer
// valid at the new level (re-derived on read anyway). Runs AFTER reconcileSubclass
// so a cleared subclass yields an empty valid set. Reuses the spellcasting undo
// branch in activity.ts (restores before.spellcasting) — no new EventType.

async function reconcileGrantedSpells(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, subclass: true, level: true },
      },
    },
  });
  if (!row) return;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  if (!state.spells.some((s) => s.source === "subclass")) return; // normal case

  // Grants across every class entry, symmetric with collectGrantedSpells. Single-
  // class uses the XP-derived level (the per-class column can be stale); a
  // multiclass entry uses its own per-class level.
  const singleClass = row.classEntries.length <= 1;
  const validIds = new Set(
    row.classEntries
      .flatMap((e) =>
        deriveGrantedSpells(e.name, e.subclass ?? undefined, singleClass ? newDerivedLevel : e.level),
      )
      .map((s) => s.id),
  );

  const kept = state.spells.filter((s) => s.source !== "subclass" || validIds.has(s.id));
  if (kept.length === state.spells.length) return; // all leaked grants still valid

  const before = {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };

  const removedCount = state.spells.length - kept.length;

  // Drop concentration if it pointed at a stripped grant (leave Shadow Arts and
  // still-kept spells untouched).
  const removedIds = new Set(
    state.spells.filter((s) => s.source === "subclass" && !validIds.has(s.id)).map((s) => s.id),
  );
  if (state.concentratingOn && removedIds.has(state.concentratingOn.entryId)) {
    state.concentratingOn = null;
  }

  state.spells = kept;

  await tx.character.update({
    where: { id: characterId },
    data: {
      spellcasting: {
        slotsUsed: state.slotsUsed,
        arcanumUsed: state.arcanumUsed,
        spells: state.spells,
        concentratingOn: state.concentratingOn,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const after = {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };

  await logEvent(tx, {
    characterId,
    category: "spellcasting",
    type: "forgetSpell",
    summary: `${removedCount} subclass-granted spell${removedCount > 1 ? "s" : ""} removed — no longer granted at this level`,
    before,
    after,
    data: { removedCount },
    batchId,
  });
}

// ── reconcileKnownList ────────────────────────────────────────────────────────
// Shared flow for trimming a level-gated "known" list in Character.resources
// (maneuvers, elemental disciplines, tool proficiency choices) when the level-
// derived choice count has decreased. Each runs AFTER reconcileSubclass so an
// already-cleared subclass produces allowed=0 (deriveResources returns null →
// choice count undefined → allowed 0 → all entries removed).
//
// Keeps the oldest entries (LIFO: drop the most-recently-learned), consistent
// with the app's LIFO-undo model and the read-clamp's slice(0, n) behavior.
//
// Uses `resources`-category events so the existing undo branch in activity.ts
// restores the full before.resources JSON with no new undo code.

type KnownListKey = "maneuversKnown" | "disciplinesKnown" | "toolProficienciesKnown";
type KnownEntry = ManeuverEntry | DisciplineEntry | ToolProfEntry;

interface KnownListConfig {
  /** Which ResourcesMutableState array this reconciler trims. */
  listKey: KnownListKey;
  /** Level-derived cap; 0 when derived is null (subclass cleared) or below grant level. */
  allowed: (derived: DerivedClassInfo | null) => number;
  /** Audit-event type (always `resources` category). */
  eventType: EventType;
  /** Two-branch summary: allowed === 0 (subclass gone) vs. reduced level cap. */
  summary: (removedCount: number, allowed: number) => string;
  /**
   * before/after snapshot for the audit event. Called on the LIVE state — once
   * before the trim and once after. MUST return a freshly-constructed object
   * (not `state` itself): the same function runs twice on the same mutable
   * object, so returning a live reference would yield identical before/after
   * payloads. Since #818 all reconcilers emit the unified 6-key snapshot via
   * snapshotResources() — the persisted payload is load-bearing for wholesale
   * undo, so it must stay the full canonical shape (never a partial subset).
   */
  snapshot: (state: ResourcesMutableState) => Record<string, unknown>;
}

async function reconcileKnownList(ctx: ReconcileContext, config: KnownListConfig): Promise<void> {
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
  // Widened view of the three list slots so the union-keyed write typechecks;
  // only ever writes back the same (sliced) list it read.
  const lists: Record<KnownListKey, KnownEntry[]> = state;
  if (lists[config.listKey].length === 0) return; // nothing to trim

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
  const allowed = config.allowed(derived);

  if (lists[config.listKey].length <= allowed) return; // within cap, no action needed

  const before = config.snapshot(state);

  const removedCount = lists[config.listKey].length - allowed;

  // Trim the target list while preserving the other resources sub-state.
  lists[config.listKey] = lists[config.listKey].slice(0, allowed);
  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const after = config.snapshot(state);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: config.eventType,
    summary: config.summary(removedCount, allowed),
    before,
    after,
    data: { removedCount, allowed },
    batchId,
  });
}

// ── reconcileManeuvers ────────────────────────────────────────────────────────
// Trims the persisted maneuversKnown array when the level-derived choice count
// has decreased. See reconcileKnownList for the shared trim/audit flow.

async function reconcileManeuvers(ctx: ReconcileContext): Promise<void> {
  return reconcileKnownList(ctx, {
    listKey: "maneuversKnown",
    allowed: (derived) => derived?.maneuverChoiceCount ?? 0,
    eventType: "maneuversReconciled",
    summary: (removedCount, allowed) =>
      allowed === 0
        ? `All ${removedCount} maneuver${removedCount > 1 ? "s" : ""} removed — subclass no longer available`
        : `${removedCount} maneuver${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed}`,
    snapshot: (state) => ({ resources: snapshotResources(state) }),
  });
}

// ── reconcileDisciplines ──────────────────────────────────────────────────────
// Trims persisted disciplinesKnown (Way of the Four Elements) when the level-
// derived choice count decreases. See reconcileKnownList for the shared flow.

async function reconcileDisciplines(ctx: ReconcileContext): Promise<void> {
  return reconcileKnownList(ctx, {
    listKey: "disciplinesKnown",
    allowed: (derived) => derived?.disciplineChoiceCount ?? 0,
    eventType: "disciplinesReconciled",
    summary: (removedCount, allowed) =>
      allowed === 0
        ? `All ${removedCount} elemental discipline${removedCount > 1 ? "s" : ""} removed — subclass no longer available`
        : `${removedCount} elemental discipline${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed}`,
    snapshot: (state) => ({ resources: snapshotResources(state) }),
  });
}

// ── reconcileToolProficiencies ────────────────────────────────────────────────
// Trims toolProficienciesKnown when the subclass no longer grants a tool choice
// (character leveled down below 3, or subclass was cleared). Only creation-fixed
// tool profs (stored in Character.toolProficiencies) are untouched — they are
// never in this array. See reconcileKnownList for the shared flow.

async function reconcileToolProficiencies(ctx: ReconcileContext): Promise<void> {
  return reconcileKnownList(ctx, {
    listKey: "toolProficienciesKnown",
    allowed: (derived) => derived?.toolProfChoiceCount ?? 0,
    eventType: "toolProficienciesReconciled",
    summary: (removedCount, allowed) =>
      allowed === 0
        ? `${removedCount} tool proficiency choice${removedCount > 1 ? "s" : ""} removed — subclass no longer available`
        : `${removedCount} tool proficiency choice${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed}`,
    snapshot: (state) => ({ resources: snapshotResources(state) }),
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

  const before = { resources: snapshotResources(state) };

  const removedKey = state.fightingStyle;
  const removedLabel = FIGHTING_STYLES.find((s) => s.key === removedKey)?.label ?? removedKey;
  state.fightingStyle = null;

  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const after = { resources: snapshotResources(state) };

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
    resources: snapshotResources(state),
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
    resources: snapshotResources(state),
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

// ── reconcileClassEntryLevels ─────────────────────────────────────────────────
// Multiclass level-down (issue #124): trims per-class CharacterClassEntry.level
// so the sum matches the XP-derived total level. Single-class characters are
// handled by revertLevelUps (experience-ops.ts) for backward compatibility and
// are skipped here (length <= 1).
//
// LIFO by position: the highest-position (most-recently-added) class loses
// levels first; an entry that would drop to 0 is deleted (never the base
// position-0 class, which is floored at level 1). The full before-state is
// snapshotted so the classLevelsReconciled revert branch (activity.ts) can
// restore levels and recreate deleted entries.

interface ClassEntrySnapshot {
  id: string;
  name: string;
  level: number;
  position: number;
  classId: string | null;
  subclass: string | null;
  subclassId: string | null;
}

async function reconcileClassEntryLevels(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const entries = (await tx.characterClassEntry.findMany({
    where: { characterId },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      name: true,
      level: true,
      position: true,
      classId: true,
      subclass: true,
      subclassId: true,
    },
  })) as ClassEntrySnapshot[];

  if (entries.length <= 1) return; // single-class → handled by revertLevelUps

  const sum = entries.reduce((s, e) => s + e.level, 0);
  if (sum <= newDerivedLevel) return; // within the derived total, nothing to trim

  const before = entries.map((e) => ({ ...e }));
  let excess = sum - newDerivedLevel;
  const removedNames: string[] = [];

  for (let i = entries.length - 1; i >= 0 && excess > 0; i--) {
    const entry = entries[i];
    const floor = entry.position === 0 ? 1 : 0; // never delete the base class
    const reducible = Math.min(entry.level - floor, excess);
    if (reducible <= 0) continue;
    const newLevel = entry.level - reducible;
    excess -= reducible;
    if (newLevel <= 0) {
      await tx.characterClassEntry.delete({ where: { id: entry.id } });
      removedNames.push(entry.name);
    } else {
      await tx.characterClassEntry.update({
        where: { id: entry.id },
        data: { level: newLevel },
      });
    }
  }

  const after = (await tx.characterClassEntry.findMany({
    where: { characterId },
    orderBy: { position: "asc" as const },
    select: {
      id: true,
      name: true,
      level: true,
      position: true,
      classId: true,
      subclass: true,
      subclassId: true,
    },
  })) as ClassEntrySnapshot[];

  const removedCount = before.length - after.length;
  const summary =
    removedCount > 0
      ? `Class levels reconciled to total ${newDerivedLevel} — removed ${removedNames.join(", ")}`
      : `Class levels reconciled to total ${newDerivedLevel}`;

  await logEvent(tx, {
    characterId,
    category: "class",
    type: "classLevelsReconciled",
    summary,
    before: { classEntries: before },
    after: { classEntries: after },
    data: { newDerivedLevel, removedCount },
    batchId,
  });
}

// ── Registry + orchestrator ───────────────────────────────────────────────────

/**
 * Ordered list of reconcilers. Each runs sequentially in the XP transaction
 * (later reconcilers see earlier ones' results — maneuvers must follow subclass).
 */
const LEVEL_GATED_RECONCILERS: Reconciler[] = [
  reconcileClassEntryLevels,
  reconcileSubclass,
  reconcileGrantedSpells,
  reconcileManeuvers,
  reconcileDisciplines,
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
