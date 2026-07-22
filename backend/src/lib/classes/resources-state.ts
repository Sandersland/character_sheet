// Leaf module: persisted class/subclass-resource JSON shape + its normalizer,
// plus the initiative-regen once-per-long-rest marker helpers — no
// back-imports. Split out of resources.ts (#1243) so combat/ modules
// (hp-in-tx.ts for the feat max-HP bonus on every heal; rest.ts for
// clearInitiativeRegenMarkers) can depend on this leaf instead of on
// resources.ts itself — resources.ts now also composes applyHealInTx (Uncanny
// Metabolism's bonus heal), which would otherwise close an import cycle
// through combat/hitpoints.ts. Mirrors spellcasting/spell-state.ts.

import { Prisma } from "@/generated/prisma/client.js";

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

// Marker in `used` recording that a oncePerLongRest initiative-regen has fired
// for a pool since the last long rest (#1239). The `__` prefix + `:` separator
// can't collide with a real camelCase pool key, so it stays out of the wire
// `pools` view (which reads only derived pool keys) and out of rest/reconcile
// pool math. Exported (not just clearInitiativeRegenMarkers) so resources.ts's
// initiativeRegenMarkerKey builds the exact same keys.
export const INITIATIVE_REGEN_MARKER_PREFIX = "__onInitiativeUsed:";

/**
 * Clear every once-per-long-rest initiative-regen marker (#1239) so the next
 * combat's regen fires again. Called from the long-rest path only (rest.ts) —
 * the cap is per LONG rest, so a short rest must leave the markers in place.
 * Lives here (not resources.ts) so rest.ts doesn't need to import
 * resources.ts, which would close an import cycle through combat/hitpoints.ts
 * (#1243 — resources.ts composes applyHealInTx for Uncanny Metabolism's heal).
 */
export function clearInitiativeRegenMarkers(state: ResourcesMutableState): void {
  for (const key of Object.keys(state.used)) {
    if (key.startsWith(INITIATIVE_REGEN_MARKER_PREFIX)) delete state.used[key];
  }
}
