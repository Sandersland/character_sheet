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
 * 3. Add a matching clamp-on-read in serializeCharacter. Both sides must
 *    compute the legal limit via one shared rule function — never two inline
 *    copies (e.g. effective-levels.ts, resources.ts clampChoicesToCaps).
 * 4. Add new EventType values as needed (schema.prisma + events.ts + migrate).
 *
 * Feats and Ability Score Improvements ship via `reconcileAdvancements`.
 */

import { Prisma } from "@/generated/prisma/client.js";
import { proficiencyBonusForLevel } from "./experience.js";
import { effectiveEntryLevel, subclassActiveAt, subclassGateLevel } from "./effective-levels.js";
import { logEvent, type EventType } from "@/lib/activity/events.js";
import {
  clampChoicesToCaps,
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  splitAdvancementsBySlotCap,
  type DisciplineEntry,
  type ManeuverEntry,
  type ResourcesMutableState,
  type ToolProfEntry,
} from "@/lib/classes/resources.js";
import { characterAdvancementSlots, characterFightingStyleFeatSlots, derivePreparedSpellLimit } from "@/lib/srd/srd.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { reverseAdvancementEffects } from "./advancement.js";
import { normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { clampPreparedToLimit, normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { deriveGrantedSpells } from "@/lib/spellcasting/granted-spells.js";

export interface ReconcileContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  /** XP-derived level after the current operation — the new authority. */
  newDerivedLevel: number;
  batchId: string;
}

type Reconciler = (ctx: ReconcileContext) => Promise<void>;

// Clears a subclass choice on ANY class entry whose effective level has dropped
// below that class's subclassLevel. Per-entry (issue #125): a multiclass
// character picks a subclass per class at that class's own grant level, so each
// entry is checked against its per-class level. For a single-class character the
// per-class level column can be stale (self-healed lazily by the HP level-up),
// so the XP-derived total is authoritative there. Runs first (after class-level
// reconciliation) so maneuver/tool reconcilers see the already-cleared subclass.

// fallow-ignore-next-line complexity -- pre-existing per-entry subclass-clear logic; unchanged by #1137, CRAP re-estimated after the fightingStyle-scalar export removal
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

  for (const entry of entries) {
    if (entry.subclass === null && entry.subclassId === null) continue;

    const effectiveLevel = effectiveEntryLevel(entry.level, entries.length, newDerivedLevel);
    if (subclassActiveAt(effectiveLevel, entry.class?.subclassLevel)) continue;
    const subclassLevel = subclassGateLevel(entry.class?.subclassLevel);

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
        select: {
          level: true,
          // Subclass-granted spells (#898): the valid-grant set is re-derived from
          // these loaded catalog rows (reconcileSubclass ran first, so a cleared
          // subclass yields subclassRef = null → an empty valid set).
          subclassRef: { include: { grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } } } },
        },
      },
    },
  });
  if (!row) return;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  if (!state.spells.some((s) => s.source === "subclass")) return; // normal case

  // Grants across every class entry, symmetric with the serialize read side.
  const validIds = new Set(
    row.classEntries
      .flatMap((e) => deriveGrantedSpells(e.subclassRef, effectiveEntryLevel(e.level, row.classEntries.length, newDerivedLevel)))
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

// Prepared-spell cap reconciler (#1127): the 2024 prepared count is a per-class
// table value, so a level-down can leave more spells prepared than the new cap
// allows. Trims the over-cap prepared entries (keeping the oldest, marking the
// rest unprepared — the entries stay learned). Runs AFTER reconcileGrantedSpells
// so it reads the post-trim spells[] with any cleared-subclass grants removed.
// Reuses the spellcasting undo branch in activity.ts (restores before.spellcasting)
// via an "unprepareSpell" event — no new EventType, mirroring reconcileGrantedSpells.

async function reconcilePreparedSpells(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, level: true, subclass: true },
      },
    },
  });
  if (!row) return;

  // Per-entry level resolution symmetric with preparedLimitEntries on the read side.
  const entries = row.classEntries.map((e) => ({
    name: e.name,
    level: effectiveEntryLevel(e.level, row.classEntries.length, newDerivedLevel),
    subclass: e.subclass,
  }));
  const limit = derivePreparedSpellLimit(entries);

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const { spells, trimmedCount } = clampPreparedToLimit(state.spells, limit);
  if (trimmedCount === 0) return; // within cap — normal case

  const snapshot = (spellsList: typeof state.spells) => ({
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...spellsList],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  });
  const before = snapshot(state.spells);
  state.spells = spells;
  const after = snapshot(state.spells);

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

  await logEvent(tx, {
    characterId,
    category: "spellcasting",
    type: "unprepareSpell",
    summary: `${trimmedCount} prepared spell${trimmedCount > 1 ? "s" : ""} unprepared — level cap reduced to ${limit}`,
    before,
    after,
    data: { trimmedCount, limit },
    batchId,
  });
}

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
   * payloads. Since #818 all reconcilers emit the unified 7-key snapshot via
   * snapshotResources() — the persisted payload is load-bearing for wholesale
   * undo, so it must stay the full canonical shape (never a partial subset).
   */
  snapshot: (state: ResourcesMutableState) => Record<string, unknown>;
}

// Shared preamble for the resources-based reconcilers (reconcileKnownList and
// reconcileSubclassChoices): fetch the row, normalize the mutable state, and
// derive class info at the new level. Returns null when the row is gone
// (caller returns early). Every entry (not just the primary) + its level is
// selected so deriveEntryScopedResources can derive each entry's own choice-cap
// fields (#1177) — deriveEntryScopedResources is pure/in-memory, so deriving
// even when the caller will bail on an empty list is negligible.
async function loadResourcesReconcileState(
  ctx: ReconcileContext,
): Promise<{ state: ResourcesMutableState; derived: DerivedClassInfo | null } | null> {
  const { tx, characterId, newDerivedLevel } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, subclass: true, level: true },
      },
    },
  });
  if (!row) return null;

  const state = normalizeResourcesMutable(row.resources);
  const abilityScores = row.abilityScores as Record<string, number>;
  const profBonus = proficiencyBonusForLevel(newDerivedLevel);
  const { derived } = deriveEntryScopedResources(row.classEntries, newDerivedLevel, abilityScores, profBonus);
  return { state, derived };
}

async function reconcileKnownList(ctx: ReconcileContext, config: KnownListConfig): Promise<void> {
  const { tx, characterId, batchId } = ctx;

  const loaded = await loadResourcesReconcileState(ctx);
  if (!loaded) return;
  const { state, derived } = loaded;

  // Widened view of the three list slots so the union-keyed write typechecks;
  // only ever writes back the same (sliced) list it read.
  const lists: Record<KnownListKey, KnownEntry[]> = state;
  if (lists[config.listKey].length === 0) return; // nothing to trim

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

// Generic level-down trim for every subclass "choose N" feature (#899). One
// reconciler serves all declared choices: for each key in choicesKnown it caps
// the list to the level-derived count (0 when the subclass no longer grants that
// choice — leveled below its tier, or subclass cleared by reconcileSubclass,
// which runs first). Keeps the oldest picks (LIFO drop), matching the read-clamp.
//
// Uses a `resources`-category event so the existing undo branch restores
// before.resources wholesale — no new undo code.

// Mutating wrapper over clampChoicesToCaps (resources.ts): applies the shared
// cap policy in place (delete-on-zero-cap), returns the entries removed.
function trimChoicesToCaps(
  choicesKnown: ResourcesMutableState["choicesKnown"],
  caps: Map<string, number>,
): number {
  const { clamped, removedCount } = clampChoicesToCaps(choicesKnown, caps);
  for (const key of Object.keys(choicesKnown)) {
    if (key in clamped) choicesKnown[key] = clamped[key];
    else delete choicesKnown[key];
  }
  return removedCount;
}

async function reconcileSubclassChoices(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, batchId } = ctx;

  const loaded = await loadResourcesReconcileState(ctx);
  if (!loaded) return;
  const { state, derived } = loaded;
  if (Object.keys(state.choicesKnown).length === 0) return; // nothing chosen

  // key → derived count; keys absent here get cap 0 (subclass/tier no longer grants them).
  const caps = new Map((derived?.subclassChoices ?? []).map((c) => [c.key, c.count]));

  // Snapshot BEFORE mutating — normalizeResourcesMutable passes the choicesKnown
  // object through by reference, so the trim below would otherwise corrupt it.
  const before = { resources: snapshotResources(state) };

  const removedCount = trimChoicesToCaps(state.choicesKnown, caps);
  if (removedCount === 0) return; // all within caps

  await tx.character.update({
    where: { id: characterId },
    data: { resources: serializeResourcesState(state) },
  });

  const after = { resources: snapshotResources(state) };

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "subclassChoicesReconciled",
    summary: `${removedCount} subclass choice${removedCount > 1 ? "s" : ""} removed — no longer available at this level`,
    before,
    after,
    data: { removedCount },
    batchId,
  });
}

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
        // All entries — the ASI cap reads the primary (position 0), the fs cap
        // sums entitlement across every class entry (#1137).
        select: { name: true, level: true },
      },
    },
  });
  if (!row) return;

  const state = normalizeResourcesMutable(row.resources);
  if (state.advancements.length === 0) return; // nothing to trim

  const allowed = characterAdvancementSlots(row.classEntries, newDerivedLevel);
  const fightingStyleAllowed = characterFightingStyleFeatSlots(row.classEntries, newDerivedLevel);

  // Origin feats are exempt from both caps and never reversed (#1130); ASI feats
  // trim beyond `allowed`, Fighting Style feats beyond `fightingStyleAllowed`
  // (#1137) — LIFO tail per partition, keeping origin entries.
  const { kept, excess: toRemove } = splitAdvancementsBySlotCap(state.advancements, allowed, fightingStyleAllowed);
  if (toRemove.length === 0) return; // within cap

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

  const removedCount = toRemove.length;

  const reversed = reverseAdvancementEffects(scores, hp, initBonus, toRemove);
  state.advancements = kept;

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

/**
 * Ordered list of reconcilers. Each runs sequentially in the XP transaction
 * (later reconcilers see earlier ones' results — maneuvers must follow subclass).
 */
const LEVEL_GATED_RECONCILERS: Reconciler[] = [
  reconcileClassEntryLevels,
  reconcileSubclass,
  reconcileGrantedSpells,
  reconcilePreparedSpells,
  reconcileManeuvers,
  reconcileDisciplines,
  reconcileToolProficiencies,
  reconcileSubclassChoices,
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
