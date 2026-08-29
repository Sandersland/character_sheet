// Leaf module (no back-imports): split out so combat code can depend on this without an import cycle through the hit-points module. Mirrors the spellcasting state module's shape.

import { Prisma } from "@/generated/prisma/client.js";

// Canonical mutable state shape, stored in Character.resources JSON column.

export interface ManeuverEntry {
  id: string;           // per-character entry UUID (operation target)
  maneuverId?: string;  // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
  // Session-UI routing snapshot from the catalog at learn time (undefined for custom maneuvers → frontend defaults to "damageRoll").
  placement?: string;
  actionSlot?: string | null;
}

export interface ToolProfEntry {
  id: string;   // per-character entry UUID (operation target)
  name: string; // matches a TOOLS entry name
}

// Capped at the level-derived expertiseChoiceCount; clamped on read and reconciled on level-down the same way toolProficienciesKnown is.
export interface ExpertiseEntry {
  id: string;    // per-character entry UUID (operation target)
  skill: string; // camelCase skill key, e.g. "stealth"
}

// Mirrors ManeuverEntry but carries no mechanics — the option catalog is GrantedAbility rows, this is just the selection snapshot. Stored under choicesKnown[choiceKey].
export interface ChoiceEntry {
  id: string;         // per-character entry UUID (operation target)
  optionId?: string;  // catalog GrantedAbility.id provenance — undefined for custom
  name: string;
  description: string;
}

// Snapshot into AdvancementEntry.improvements at take-time so removal/derivation never depend on the catalog row being present.
// Numeric targets (summed by deriveFeatBonuses): initiative | speed | armorClass | maxHp.
// Keyed targets (collected by deriveFeatProficiencies, OR'd with stored proficiencies): skillProficiency (key = camelCase skill, e.g. "athletics") | savingThrowProficiency (key = ability name, e.g. "strength").
// perLevel: effective bonus = amount × hitDice.total — numeric targets only (e.g. Tough's +2 HP/level).
export interface FeatImprovement {
  target: string;
  amount: number;
  perLevel?: boolean;
  key?: string;
  // PHB'24: "proficiencyBonus" multiplies amount by PB at read time (e.g. Alert).
  scaling?: "proficiencyBonus";
}

// Stores the deltas applied so reversal subtracts exactly what was added — never recomputes from ability scores, which may have changed since.
// fallow-ignore-next-line code-duplication -- FeatImprovement/AdvancementEntry intentionally mirror the frontend's wire types; cross-workspace clone, shared-types consolidation is #820
export interface AdvancementEntry {
  id: string;                            // per-character entry UUID (operation target)
  level: number;                         // character level when taken (informational)
  kind: "asi" | "feat";
  // PHB'24 Origin feat (background grant): exempt from the ASI slot cap, never reversed on level-down, can't be removed via the route.
  origin?: true;
  // Fighting Style feat: consumes a fightingStyle slot, not an ASI slot. Absent means ASI-slot feat/ASI — both partitions live in this one array.
  slot?: "fightingStyle";
  // e.g. { strength: 2 } or { dexterity: 1, constitution: 1 }
  abilityDeltas: Record<string, number>;
  // HP added to hitPoints.max/current (CON-mod change × hitDice.total).
  hpDelta: number;
  // Addend applied to initiativeBonus (DEX-mod change).
  initDelta: number;
  // Catalog Feat.id provenance — undefined for ASI or custom feat.
  featId?: string;
  featName?: string;
  featDescription?: string;
  // Snapshot of the feat's structured mechanical effects at take-time, applied as a derived modifier layer in serializeCharacter/effective-max computations — never persisted into separate columns. Empty for ASI entries.
  improvements?: FeatImprovement[];
}

export interface ResourcesMutableState {
  used: Record<string, number>;
  maneuversKnown: ManeuverEntry[];
  toolProficienciesKnown: ToolProfEntry[];
  expertiseKnown: ExpertiseEntry[];
  // Keyed by SubclassChoice.key (e.g. "huntersPrey"); capped at the level-derived count, trimmed by reconcileSubclassChoices on level-down. A new choose-N feature adds a subclass declaration + seed rows — no new state key here.
  choicesKnown: Record<string, ChoiceEntry[]>;
  // Fighting Style feats live here too, tagged slot: "fightingStyle" — no separate key.
  advancements: AdvancementEntry[];
}

// Single-sourced level-gating for choicesKnown, shared by reconcile-on-write (trimChoicesToCaps) and clamp-on-read (buildResourcesPayload). Keys absent from `caps` get cap 0 and are dropped from `clamped`; `removedCount` is the total entries over cap.
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

// Single source of the ASI-slot cap policy, shared by every clamp-on-read and reconcile-on-write site.
// Three partitions: origin feats always kept (no slot); fighting-style feats keep the earliest fightingStyleSlotTotal against their own cap; every other ASI/feat keeps the earliest slotTotal. Each partition trims the tail beyond its cap into `excess`.
// fightingStyleSlotTotal defaults to Infinity so non-reconcile callers (HP/concentration feat-bonus reads) keep every fs feat untrimmed — only the serialize clamp + reconciler pass the real cap.
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

// Tolerant of null (never-used resources) and future schema additions — mirrors normalizeSpellcastingMutable.
export function normalizeResourcesMutable(json: Prisma.JsonValue): ResourcesMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return {
      used: {},
      maneuversKnown: [],
      toolProficienciesKnown: [],
      expertiseKnown: [],
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
    toolProficienciesKnown: (obj.toolProficienciesKnown as ToolProfEntry[]) ?? [],
    expertiseKnown: (obj.expertiseKnown as ExpertiseEntry[]) ?? [],
    choicesKnown,
    advancements: (obj.advancements as AdvancementEntry[]) ?? [],
  };
}

// Route every update through this helper so all keys round-trip — required now that multiple level-gated lists share one column.
export function serializeResourcesState(state: ResourcesMutableState): Prisma.InputJsonValue {
  return {
    used: state.used,
    maneuversKnown: state.maneuversKnown,
    toolProficienciesKnown: state.toolProficienciesKnown,
    expertiseKnown: state.expertiseKnown,
    choicesKnown: state.choicesKnown,
    advancements: state.advancements,
  } as unknown as Prisma.InputJsonValue;
}

// The one source of truth for every before/after event snapshot — the undo handlers restore before.resources wholesale, so an omitted key here silently wipes on revert.
export function snapshotResources(state: ResourcesMutableState): ResourcesMutableState {
  return {
    used: { ...state.used },
    maneuversKnown: state.maneuversKnown.map((m) => ({ ...m })),
    toolProficienciesKnown: state.toolProficienciesKnown.map((t) => ({ ...t })),
    expertiseKnown: state.expertiseKnown.map((e) => ({ ...e })),
    choicesKnown: Object.fromEntries(
      Object.entries(state.choicesKnown).map(([key, entries]) => [key, entries.map((e) => ({ ...e }))]),
    ),
    advancements: state.advancements.map((a) => ({
      ...a,
      abilityDeltas: { ...a.abilityDeltas },
      // Shallow-copy so a later mutation of state can't retroactively alter this snapshot — FeatImprovement elements are treated as immutable.
      improvements: a.improvements ? [...a.improvements] : undefined,
    })),
  };
}

// The `__` prefix + `:` separator can't collide with a real camelCase pool key, so it stays out of the wire `pools` view and rest/reconcile pool math.
// Exported so initiativeRegenMarkerKey builds the exact same keys.
export const INITIATIVE_REGEN_MARKER_PREFIX = "__onInitiativeUsed:";

// Called from the long-rest path only — the cap is per LONG rest, so a short rest must leave the markers in place.
// Lives here, not with the rest of resource state, so the rest-handling code doesn't need to import that module — avoiding an import cycle through the hit-points module.
export function clearInitiativeRegenMarkers(state: ResourcesMutableState): void {
  for (const key of Object.keys(state.used)) {
    if (key.startsWith(INITIATIVE_REGEN_MARKER_PREFIX)) delete state.used[key];
  }
}
