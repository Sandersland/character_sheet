import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { proficiencyBonusForLevel } from "./experience.js";
import { effectiveEntryLevel, levelDownEntryLevels, subclassActiveAt, subclassGateLevel } from "./effective-levels.js";
import { logEvent, type EventType } from "@/lib/activity/events.js";
import {
  clampChoicesToCaps,
  normalizeResourcesMutable,
  serializeResourcesState,
  snapshotResources,
  splitAdvancementsBySlotCap,
  type ExpertiseEntry,
  type ManeuverEntry,
  type ResourcesMutableState,
  type ToolProfEntry,
} from "@/lib/classes/resources.js";
import { characterAdvancementSlots, characterFightingStyleFeatSlots, derivePreparedSpellLimit, deriveFeatBonuses } from "@/lib/srd/srd.js";
import { deriveEntryScopedResources, type DerivedClassInfo } from "@/lib/classes/class-features.js";
import { draconicResilienceMaxHpTerm } from "@/lib/classes/draconic-bloodline.js";
import { weaponBondEligible } from "@/lib/classes/weapon-bond.js";
import { FEATURE_ROWS_ENTRY_SELECT, featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import { reverseAdvancementEffects } from "./advancement.js";
import { effectiveMaxHitPoints, normalizeHitDice, normalizeHitPoints } from "@/lib/combat/hitpoints.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { clampPreparedToLimit, normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import {
  deriveGrantedSpells,
  speciesGrantedSpellSourceFromRaceSelection,
  RACE_SELECTION_GRANT_SELECT,
} from "@/lib/spellcasting/granted-spells.js";

export interface ReconcileContext {
  tx: Prisma.TransactionClient;
  characterId: string;
  newDerivedLevel: number;
  /** Write-once (#1285) — constant across the whole reconcile pass. */
  edition: RulesEdition;
  batchId: string;
}

type Reconciler = (ctx: ReconcileContext) => Promise<void>;

// Per-entry (#125): a multiclass character picks a subclass per class at that
// class's own grant level. For a single-class character the per-class level
// column can be stale (self-healed lazily by the HP level-up), so the
// XP-derived total is authoritative there.

// fallow-ignore-next-line complexity -- per-entry subclass-clear branching is inherent to multiclass support
async function reconcileSubclass(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, edition, batchId } = ctx;

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
    if (subclassActiveAt(effectiveLevel, entry.class?.subclassLevel, edition)) continue;
    const subclassLevel = subclassGateLevel(entry.class?.subclassLevel, edition);

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

// Eldritch Knight Weapon Bond (PHB'14 p.75, #1854). weaponBondEligible is the
// shared rule function the bond/unbond op and serializeCharacter's
// clamp-on-read both call.
async function reconcileWeaponBond(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, edition, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, level: true, subclass: true, subclassId: true, subclassRef: { select: { slug: true } } },
      },
    },
  });
  if (!row) return;

  const { eligible } = weaponBondEligible(row.classEntries, newDerivedLevel, edition);
  if (eligible) return;

  const bonded = await tx.inventoryItem.findMany({
    where: { characterId, weaponBonded: true },
    select: { id: true, name: true },
  });
  if (bonded.length === 0) return;

  await tx.inventoryItem.updateMany({ where: { characterId, weaponBonded: true }, data: { weaponBonded: false } });

  for (const item of bonded) {
    await logEvent(tx, {
      characterId,
      category: "inventory",
      type: "weaponUnbonded",
      summary: `${item.name} unbonded (level dropped below Weapon Bond's requirement)`,
      entityType: "InventoryItem",
      entityId: item.id,
      before: { weaponBonded: true },
      after: { weaponBonded: false },
      batchId,
    });
  }
}

// Defense-in-depth (#1683): subclass/species-granted spells are pure-derived
// at read time and never persisted in the happy path; this only fires if a
// `granted:`-id entry leaks into the stored spells[]. Runs after
// reconcileSubclass so a cleared subclass yields an empty valid set.
async function reconcileGrantedSpells(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, edition, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: {
          level: true,
          subclassRef: { include: { grantedSpells: { orderBy: { gateLevel: "asc" }, include: { spell: true } } } },
        },
      },
      // Species/lineage grants (#1683) share RACE_SELECTION_GRANT_SELECT and
      // speciesGrantedSpellSourceFromRaceSelection with the spellcasting
      // transaction-op layer — one query fragment, not two copies.
      raceSelection: { select: RACE_SELECTION_GRANT_SELECT },
    },
  });
  if (!row) return;

  const state = normalizeSpellcastingMutable(row.spellcasting);
  // `granted:`-id prefix, not `source` — a #1689 species-CHOICE entry also
  // carries source:"species" but must never be treated as a leaked grant.
  if (!state.spells.some((s) => s.id.startsWith("granted:"))) return;

  const speciesSource = speciesGrantedSpellSourceFromRaceSelection(row.raceSelection);

  // ctx.edition matches the authority editionOf resolves for the read side.
  // Species grants use the XP-derived level directly — not scoped to a class entry.
  const validIds = new Set([
    ...row.classEntries.flatMap((e) => deriveGrantedSpells(e.subclassRef, effectiveEntryLevel(e.level, row.classEntries.length, newDerivedLevel), edition)).map((s) => s.id),
    ...deriveGrantedSpells(speciesSource, newDerivedLevel, edition, "species").map((s) => s.id),
  ]);

  const isGranted = (s: { id: string }) => s.id.startsWith("granted:");
  const kept = state.spells.filter((s) => !isGranted(s) || validIds.has(s.id));
  if (kept.length === state.spells.length) return;

  const before = {
    spellcasting: {
      slotsUsed: { ...state.slotsUsed },
      arcanumUsed: { ...state.arcanumUsed },
      spells: [...state.spells],
      concentratingOn: state.concentratingOn ? { ...state.concentratingOn } : null,
    },
  };

  const removedCount = state.spells.length - kept.length;

  const removedIds = new Set(
    state.spells.filter((s) => isGranted(s) && !validIds.has(s.id)).map((s) => s.id),
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
    summary: `${removedCount} granted spell${removedCount > 1 ? "s" : ""} removed — no longer granted at this level`,
    before,
    after,
    data: { removedCount },
    batchId,
  });
}

// Prepared-spell cap reconciler (#1127): trims over-cap prepared entries,
// keeping the oldest — trimmed spells stay known, just unprepared. Runs after
// reconcileGrantedSpells so it reads the post-trim spells[].
async function reconcilePreparedSpells(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, batchId, edition } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      spellcasting: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        // derivePreparedSpellLimit reads casterFraction/spellcastingAbility off
        // subclassRef, not the free-text `subclass` name.
        select: { name: true, level: true, subclassRef: { select: { casterFraction: true, spellcastingAbility: true } } },
      },
    },
  });
  if (!row) return;

  // Per-entry level resolution symmetric with preparedLimitEntries on the read side.
  const entries = row.classEntries.map((e) => ({
    name: e.name,
    level: effectiveEntryLevel(e.level, row.classEntries.length, newDerivedLevel),
    subclassRef: e.subclassRef,
  }));
  // Coupling latch: must resolve through the same derivePreparedSpellLimit as
  // buildSpellcastingView's clamp-on-read — never a second inline copy.
  const limit = derivePreparedSpellLimit(entries, row.abilityScores as Record<string, number>, edition);

  const state = normalizeSpellcastingMutable(row.spellcasting);
  const { spells, trimmedCount } = clampPreparedToLimit(state.spells, limit);
  if (trimmedCount === 0) return;

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

// Runs after reconcileSubclass so a cleared subclass yields allowed=0. Keeps
// the oldest entries (LIFO drop), matching the read-clamp's slice(0, n).

type KnownListKey = "maneuversKnown" | "toolProficienciesKnown" | "expertiseKnown";
type KnownEntry = ManeuverEntry | ToolProfEntry | ExpertiseEntry;

interface KnownListConfig {
  listKey: KnownListKey;
  /** 0 when derived is null (subclass cleared) or below grant level. */
  allowed: (derived: DerivedClassInfo | null) => number;
  eventType: EventType;
  summary: (removedCount: number, allowed: number) => string;
  /** Must return a freshly-constructed object (not `state` itself) — this
   *  function runs twice on the same mutable object, so a live reference
   *  would make before and after identical. */
  snapshot: (state: ResourcesMutableState) => Record<string, unknown>;
}

// Every entry (not just the primary) is selected so deriveEntryScopedResources
// can derive each entry's own choice-cap fields (#1177).
async function loadResourcesReconcileState(
  ctx: ReconcileContext,
): Promise<{ state: ResourcesMutableState; derived: DerivedClassInfo | null } | null> {
  const { tx, characterId, newDerivedLevel, edition } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      abilityScores: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        select: { name: true, subclass: true, level: true, ...FEATURE_ROWS_ENTRY_SELECT },
      },
    },
  });
  if (!row) return null;

  const state = normalizeResourcesMutable(row.resources);
  const abilityScores = row.abilityScores as Record<string, number>;
  const profBonus = proficiencyBonusForLevel(newDerivedLevel);
  // featureRowsOf is required — Battle Master's counts resolve through
  // row-driven derivedStat columns, not static config (#1546).
  const { derived } = deriveEntryScopedResources(row.classEntries, newDerivedLevel, abilityScores, profBonus, edition, featureRowsOf);
  return { state, derived };
}

async function reconcileKnownList(ctx: ReconcileContext, config: KnownListConfig): Promise<void> {
  const { tx, characterId, batchId } = ctx;

  const loaded = await loadResourcesReconcileState(ctx);
  if (!loaded) return;
  const { state, derived } = loaded;

  // Widened view so the union-keyed write typechecks; only ever writes back
  // the list it read.
  const lists: Record<KnownListKey, KnownEntry[]> = state;
  if (lists[config.listKey].length === 0) return;

  const allowed = config.allowed(derived);

  if (lists[config.listKey].length <= allowed) return;

  const before = config.snapshot(state);

  const removedCount = lists[config.listKey].length - allowed;

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

// Character.toolProficiencies (creation-fixed) is separate — never touched here.
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

// expertiseChoiceCount resolves through the same deriveEntryScopedResources
// buildResourcesPayload's clamp-on-read uses.
async function reconcileExpertise(ctx: ReconcileContext): Promise<void> {
  return reconcileKnownList(ctx, {
    listKey: "expertiseKnown",
    allowed: (derived) => derived?.expertiseChoiceCount ?? 0,
    eventType: "expertiseReconciled",
    summary: (removedCount, allowed) =>
      allowed === 0
        ? `${removedCount} Expertise skill${removedCount > 1 ? "s" : ""} removed — no longer granted at this level`
        : `${removedCount} Expertise skill${removedCount > 1 ? "s" : ""} removed — level cap reduced to ${allowed}`,
    snapshot: (state) => ({ resources: snapshotResources(state) }),
  });
}

// Caps each choicesKnown key to its level-derived count (0 when
// reconcileSubclass has already cleared the subclass). Keeps the oldest
// picks (LIFO drop), matching the read-clamp.

// Wraps clampChoicesToCaps to mutate choicesKnown in place; delete-on-zero-cap.
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
  if (Object.keys(state.choicesKnown).length === 0) return;

  // key → derived count; keys absent here get cap 0 (subclass/tier no longer grants them).
  const caps = new Map((derived?.subclassChoices ?? []).map((c) => [c.key, c.count]));

  // Must snapshot before mutating — choicesKnown is a live reference, not a copy.
  const before = { resources: snapshotResources(state) };

  const removedCount = trimChoicesToCaps(state.choicesKnown, caps);
  if (removedCount === 0) return;

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

// Reverses advancements[] LIFO when XP-derived level drops past an ASI level,
// subtracting the stored deltas rather than recomputing so it stays exact
// even if other ops changed these columns since. Order-independent of
// reconcileSubclass/reconcileManeuvers — ASI slots are class-level-gated, not
// subclass-gated.
async function reconcileAdvancements(ctx: ReconcileContext): Promise<void> {
  const { tx, characterId, newDerivedLevel, edition, batchId } = ctx;

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: {
      resources: true,
      abilityScores: true,
      hitPoints: true,
      hitDice: true,
      initiativeBonus: true,
      // conditions (#1321): feeds effectiveMaxHitPoints — must resolve the HP
      // ceiling through the same function serializeCharacter's clamp-on-read uses.
      conditions: true,
      classEntries: {
        orderBy: { position: "asc" as const },
        // Per-entry (#1073/#1137): ASI/feat-slot and fighting-style caps sum
        // across every class entry. `class` columns must match
        // applyAdvancementClamp's characterInclude (#1529); subclass/
        // subclassRef.slug/class.subclassLevel feed draconicResilienceMaxHpTerm
        // (#1123).
        select: {
          name: true,
          level: true,
          subclass: true,
          subclassRef: { select: { slug: true } },
          // `class.name` (#1148): characterFightingStyleFeatSlots' resolveSubclassSlug
          // input — the canonical class name, same #1495 rationale as
          // applyAdvancementClamp's own select.
          class: { select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, subclassLevel: true } },
        },
      },
    },
  });
  if (!row) return;

  const state = normalizeResourcesMutable(row.resources);
  if (state.advancements.length === 0) return;

  const allowed = characterAdvancementSlots(row.classEntries, newDerivedLevel);
  // edition (#1148): Champion's Additional Fighting Style second slot forks 7
  // (2024) vs 10 (2014) — characterFightingStyleFeatSlots must match what
  // applyAdvancementClamp resolves.
  const fightingStyleAllowed = characterFightingStyleFeatSlots(row.classEntries, newDerivedLevel, edition);

  // Origin feats are exempt from both caps and never reversed (#1130); ASI vs
  // Fighting Style feats trim against their own cap, LIFO tail per partition.
  const { kept, excess: toRemove } = splitAdvancementsBySlotCap(state.advancements, allowed, fightingStyleAllowed);
  if (toRemove.length === 0) return;

  const scores = row.abilityScores as Record<string, number>;
  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const initBonus = row.initiativeBonus;

  const before = {
    abilityScores: { ...scores },
    hitPoints: { ...hp, deathSaves: { ...hp.deathSaves } },
    initiativeBonus: initBonus,
    resources: snapshotResources(state),
  };

  const removedCount = toRemove.length;

  const reversed = reverseAdvancementEffects(scores, hp, initBonus, toRemove);
  state.advancements = kept;

  // reverseAdvancementEffects doesn't clamp; effectiveMaxHitPoints does, here
  // — the same function serializeCharacter's clamp-on-read resolves through.
  // `kept` matches applyFeatLayer's own use of the clamped slice.
  // draconicResilienceMaxHpTerm joins the feat bonus in the same pre-halving
  // composition applyFeatLayer uses; newDerivedLevel matches the clamp-on-
  // read's progress.level input.
  const maxHpBonus =
    deriveFeatBonuses(kept, hd.total).maxHp +
    draconicResilienceMaxHpTerm(row.classEntries, newDerivedLevel, edition);
  const exhaustionLevel = normalizeConditionsMutable(row.conditions).exhaustion;
  const newEffMax = effectiveMaxHitPoints(reversed.hitPoints.max, maxHpBonus, exhaustionLevel, edition);
  const newHp = {
    ...reversed.hitPoints,
    current: Math.min(reversed.hitPoints.current, newEffMax),
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

// Multiclass level-down (#124): trims per-class CharacterClassEntry.level so
// the sum matches the XP-derived total level. Single-class characters are
// handled by revertLevelUps, not here (length <= 1).
//
// LIFO by position: highest-position class loses levels first; an entry
// dropping to 0 is deleted (never the base position-0 class, floored at 1).

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

  if (entries.length <= 1) return;

  const sum = entries.reduce((s, e) => s + e.level, 0);
  if (sum <= newDerivedLevel) return;

  const before = entries.map((e) => ({ ...e }));
  const removedNames: string[] = [];

  // levelDownEntryLevels is the shared pure rule — computeLevelDownState
  // (#1123) projects this exact outcome before this reconciler runs; this
  // function only persists it.
  const newLevels = levelDownEntryLevels(entries.map((e) => e.level), newDerivedLevel);
  for (let i = entries.length - 1; i >= 0; i--) {
    const entry = entries[i];
    const newLevel = newLevels[i];
    if (newLevel === entry.level) continue;
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
 * Order matters — later reconcilers see earlier results (maneuvers must
 * follow subclass).
 *
 * No reconciler exists for #1681's species/subrace ability increases: species
 * is immutable post-creation, so that state can never drift out of bounds.
 */
const LEVEL_GATED_RECONCILERS: Reconciler[] = [
  reconcileClassEntryLevels,
  reconcileSubclass,
  reconcileWeaponBond,
  reconcileGrantedSpells,
  reconcilePreparedSpells,
  reconcileManeuvers,
  reconcileToolProficiencies,
  reconcileExpertise,
  reconcileSubclassChoices,
  reconcileAdvancements,
];

/** Call once per XP operation in applyExperienceOperations, after the XP
 *  value and derived level are committed. */
export async function reconcileLevelGatedState(ctx: ReconcileContext): Promise<void> {
  for (const reconcile of LEVEL_GATED_RECONCILERS) {
    await reconcile(ctx);
  }
}
