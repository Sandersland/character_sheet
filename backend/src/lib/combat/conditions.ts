/**
 * Conditions transaction handler — the analog to applyResourceOperations for tracking
 * a character's active status conditions (prone, poisoned, stunned, …) plus a
 * single 0–6 exhaustion level.
 *
 * What is persisted (Character.conditions JSON column):
 *   - `active`: list of ConditionEntry — one per applied standard 5e condition,
 *     boolean presence (deduped by key). Carries provenance (source) + appliedAt.
 *   - `exhaustion`: a single 0–6 numeric level (special case, not in `active`).
 *
 * Nothing here is derived from level/class — conditions are pure mutable state.
 * The canonical condition rules data (labels/descriptions) lives in srd/srd.ts.
 * Concentration is intentionally separate (tracked in spellcasting).
 */

import type {
  ApplyConditionOperation,
  ConditionOperation,
  RemoveConditionOperation,
  SetExhaustionOperation,
} from "@character-sheet/contracts";
import type { RulesEdition } from "@character-sheet/shared-types";

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience } from "@/lib/leveling/experience.js";
import { draconicResilienceMaxHpTerm } from "@/lib/classes/draconic-bloodline.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import {
  featureRowsOf,
  FEATURE_ROWS_CLASS_FEATURES,
  FEATURE_ROWS_SUBCLASS_FEATURES,
  type FeatureRowsEntry,
} from "@/lib/classes/feature-rows-select.js";
import { conditionImmunitiesFromRows, type ClassFeatureRow } from "@/lib/classes/class-feature-rows.js";
import {
  activeImmuneConditions,
  normalizeActiveEffectsMutable,
  type ActiveEffectsMutableState,
} from "./active-effects.js";
import {
  CONDITIONS,
  EXHAUSTION_MAX,
  characterFightingStyleFeatSlots,
  deriveFeatBonuses,
  isKnownCondition,
  type ConditionKey,
} from "@/lib/srd/srd.js";
import {
  effectiveMaxHitPoints,
  inCapAdvancementsAt,
  normalizeHitDice,
  normalizeHitPoints,
  type HitDice,
  type HitPoints,
} from "./hp-core.js";

export class InvalidConditionOperationError extends Error {}

/** One applied standard 5e condition. Boolean presence — deduped by `key`. */
export interface ConditionEntry {
  key: ConditionKey;
  /** Optional provenance, e.g. "Hold Person", "Grappled by ogre". */
  source?: string;
  /** ISO timestamp recorded at apply time (informational). */
  appliedAt: string;
}

/**
 * A condition suspended (not cured) by a while-active buff starting, restored
 * when that buff ends (#1121 — PHB'14 p.49's Mindless Rage: "If you are
 * charmed or frightened when you enter your rage, the effect is suspended for
 * the duration of the rage"). Distinct from `active`: a suspended condition is
 * NOT currently in effect (buildRollModifiers/the write-guard both ignore
 * it), it is real persisted state waiting to come back — the one place this
 * app stores a condition that exists but isn't active. `gatingBuffKey` is
 * provenance: which buff's start suspended it (named in the restore event's
 * summary). What actually brings it back is restoreSuspendedConditionsForBuffEndInTx,
 * which runs inside EVERY buff clear (clearBuffByKeyInTx /
 * clearWhileActiveBuffsInTx / clearBuffsForRestInTx / clearBuffsForSourceInTx
 * all share one core that calls it) and restores each suspended entry the
 * moment deriveImmuneConditions no longer blocks it — so no clearing path,
 * voluntary or involuntary, can strand an entry, and an entry whose immunity
 * is still granted by ANOTHER active buff stays suspended until that one
 * ends too.
 */
export interface SuspendedConditionEntry {
  key: ConditionKey;
  source?: string;
  /** Original appliedAt, preserved across the suspend/restore round-trip. */
  appliedAt: string;
  gatingBuffKey: string;
}

export interface ConditionsMutableState {
  active: ConditionEntry[];
  /** Exhaustion level, 0–6 (6 = death). Special case, not part of `active`. */
  exhaustion: number;
  /** Conditions suspended by an active buff (#1121) — see SuspendedConditionEntry. */
  suspended: SuspendedConditionEntry[];
}

// Tolerant of null (character has never had a condition) and of stale/unknown
// keys (dropped). Mirror of normalizeResourcesMutable. Exhaustion clamped 0–6.

// The (key, source, appliedAt) triple both ConditionEntry and
// SuspendedConditionEntry share — one parse, reused by both normalizers below
// (#1121), instead of two near-identical loops. `null` means the raw entry
// isn't shaped like a condition at all (dropped by both callers, clamp-on-read).
function parseConditionEntryBase(raw: unknown): { key: ConditionKey; source?: string; appliedAt: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const key = entry.key;
  if (typeof key !== "string" || !isKnownCondition(key)) return null;
  return {
    key,
    source: typeof entry.source === "string" ? entry.source : undefined,
    appliedAt: typeof entry.appliedAt === "string" ? entry.appliedAt : new Date(0).toISOString(),
  };
}

function normalizeConditionEntryList(raw: unknown): ConditionEntry[] {
  const rawList = Array.isArray(raw) ? raw : [];
  const out: ConditionEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of rawList) {
    const entry = parseConditionEntryBase(rawEntry);
    // Dedupe by key (clamp-on-read) — unknown-key rejection already happened in parseConditionEntryBase.
    if (!entry || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push(entry);
  }
  return out;
}

function normalizeSuspendedConditions(raw: unknown): SuspendedConditionEntry[] {
  const rawList = Array.isArray(raw) ? raw : [];
  const out: SuspendedConditionEntry[] = [];
  const seen = new Set<string>();
  for (const rawEntry of rawList) {
    const entry = parseConditionEntryBase(rawEntry);
    const gatingBuffKey = (rawEntry as Record<string, unknown> | null)?.gatingBuffKey;
    // Dedupe by key (clamp-on-read), mirroring normalizeConditionEntryList —
    // active and suspended share the one-entry-per-condition invariant.
    if (!entry || typeof gatingBuffKey !== "string" || gatingBuffKey.length === 0 || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({ ...entry, gatingBuffKey });
  }
  return out;
}

export function normalizeConditionsMutable(json: Prisma.JsonValue): ConditionsMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { active: [], exhaustion: 0, suspended: [] };
  }
  const obj = json as Record<string, unknown>;
  const active = normalizeConditionEntryList(obj.active);
  const suspended = normalizeSuspendedConditions(obj.suspended);

  const exhaustion = Math.min(
    EXHAUSTION_MAX,
    Math.max(0, Math.trunc(Number(obj.exhaustion ?? 0))),
  );

  return { active, exhaustion, suspended };
}

/**
 * Serializes the full mutable conditions state to the shape written to
 * Character.conditions. Route every update through this helper so all keys
 * round-trip.
 */
export function serializeConditionsState(state: ConditionsMutableState): Prisma.InputJsonValue {
  return {
    active: state.active.map((e) => ({
      key: e.key,
      source: e.source ?? null,
      appliedAt: e.appliedAt,
    })),
    exhaustion: state.exhaustion,
    suspended: state.suspended.map((e) => ({
      key: e.key,
      source: e.source ?? null,
      appliedAt: e.appliedAt,
      gatingBuffKey: e.gatingBuffKey,
    })),
  } as unknown as Prisma.InputJsonValue;
}

function deepCopy(state: ConditionsMutableState): { conditions: ConditionsMutableState } {
  return {
    conditions: {
      active: state.active.map((e) => ({ ...e })),
      exhaustion: state.exhaustion,
      suspended: state.suspended.map((e) => ({ ...e })),
    },
  };
}

function conditionLabel(key: ConditionKey): string {
  return CONDITIONS.find((c) => c.key === key)?.label ?? key;
}

/**
 * Apply a condition inside a caller-supplied transaction, sharing its batchId so
 * batch revert restores conditions. Idempotent: a no-op (no event) when already
 * present. Lets an activated ability (e.g. Channel Divinity: Cloak of Shadows)
 * self-apply a condition without opening its own transaction.
 */
export async function applyConditionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  key: ConditionKey,
  source: string,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: CONDITION_IN_TX_SELECT,
  });
  if (!row) return;

  const state = normalizeConditionsMutable(row.conditions);
  // #1121 review finding 2: an ability-effect self-apply is idempotent
  // against `suspended` too, not just `active` — without this, an ability
  // could push a SECOND Charmed while an older one sits suspended by Mindless
  // Rage, and the restore-on-rage-end would then find `active` already
  // occupied (the finding-3 defensive dedup below would silently drop the
  // restore, permanently stranding it in `suspended`).
  if (state.active.some((e) => e.key === key) || state.suspended.some((s) => s.key === key)) return;
  // Mirrors the public write-guard (resolveApplyCondition) — an internal
  // self-apply can't grant an immune condition either. Silent no-op, not a
  // throw: unlike the validated user-initiated route, this is a best-effort
  // side effect of an unrelated ability (e.g. Cloak of Shadows granting
  // Invisible) — aborting that ability's whole cast over an immunity that
  // has nothing to do with it would be the wrong failure mode.
  const totalLevel = levelForExperience(row.experiencePoints);
  const immune = deriveImmuneConditions(
    immuneConditionEntryRows(row.classEntries, totalLevel),
    row.rulesEdition,
    normalizeActiveEffectsMutable(row.activeEffects),
  );
  if (immune.includes(key)) return;

  const before = deepCopy(state);
  state.active.push({ key, source, appliedAt: new Date().toISOString() });

  await tx.character.update({
    where: { id: characterId },
    data: { conditions: serializeConditionsState(state) },
  });

  await logEvent(tx, {
    characterId,
    category: "conditions",
    type: "conditionApplied",
    summary: `Applied condition: ${conditionLabel(key)} (${source})`,
    before,
    after: deepCopy(state),
    data: { key, source },
    batchId,
    sessionId,
  });
}

/**
 * Applies a batch of condition operations atomically in one Prisma transaction.
 * Mirrors applyResourceOperations exactly:
 *   - one batchId groups all ops in this request on the activity timeline
 *   - any throw rolls back the entire batch (state unchanged)
 *   - CharacterEvent logged per op with full before/after conditions snapshot
 *     for revert symmetry with the resources/spellcasting undo handler
 *   - state is re-read per op so a batch of multiple ops sees each prior result
 */
// Validates + applies one condition op to `state` (mutated in place) and returns
// the audit-event fields (type/summary/data) it produced. Splitting this off the
// transaction closure keeps applyConditionsOperations a thin normalize → resolve
// → persist → log pipeline; the strings/data here are byte-identical to before
// (the audit payloads feed LIFO undo).
type ConditionEventType = "conditionApplied" | "conditionRemoved" | "exhaustionSet";
type ConditionResolution = { eventType: ConditionEventType; summary: string; eventData: Record<string, unknown> };

function resolveApplyCondition(
  state: ConditionsMutableState,
  op: ApplyConditionOperation,
  immune: ReadonlySet<ConditionKey>,
): ConditionResolution {
  if (!isKnownCondition(op.key)) {
    throw new InvalidConditionOperationError(`Unknown condition: ${op.key}`);
  }
  if (state.active.some((e) => e.key === op.key)) {
    throw new InvalidConditionOperationError(`Condition already active: ${conditionLabel(op.key)}`);
  }
  // A suspended condition still EXISTS (2014 Mindless Rage limbo), so
  // re-applying it is rejected like an active duplicate — and the immune
  // guard below does NOT cover this case: the immunity gate can lapse while
  // the suspension persists (XP dropped below the granting level mid-rage),
  // and a second active copy would make the buff-end restore's dedup skip
  // the suspended one (silently discarding it) — or resurrect it after a
  // remove.
  if (state.suspended.some((s) => s.key === op.key)) {
    throw new InvalidConditionOperationError(`Condition already suspended: ${conditionLabel(op.key)}`);
  }
  // #1121 decision 3: blocked, not auto-cleared — an auto-clear-with-audit
  // would produce a confusing history for a state that was never legal.
  if (immune.has(op.key)) {
    throw new InvalidConditionOperationError(`Immune to condition: ${conditionLabel(op.key)}`);
  }
  const entry: ConditionEntry = { key: op.key, source: op.source, appliedAt: new Date().toISOString() };
  state.active.push(entry);
  return {
    eventType: "conditionApplied",
    summary: op.source
      ? `Applied condition: ${conditionLabel(op.key)} (${op.source})`
      : `Applied condition: ${conditionLabel(op.key)}`,
    eventData: { key: op.key, source: op.source ?? null },
  };
}

function resolveRemoveCondition(state: ConditionsMutableState, op: RemoveConditionOperation): ConditionResolution {
  const idx = state.active.findIndex((e) => e.key === op.key);
  if (idx === -1) {
    throw new InvalidConditionOperationError(`Condition not active: ${conditionLabel(op.key)}`);
  }
  state.active.splice(idx, 1);
  return {
    eventType: "conditionRemoved",
    summary: `Removed condition: ${conditionLabel(op.key)}`,
    eventData: { key: op.key },
  };
}

// #1321: hp-max inputs a setExhaustion resolution needs to enforce the
// one-way clamp (decision 4) — the same maxHpBonus/edition composition
// buildHpOpContext assembles, gathered here independently (conditions.ts has
// no HpOpContext of its own) via the same shared rule functions.
interface ExhaustionHpClampInputs {
  hp: HitPoints;
  /** Feat + Draconic subclass max-HP bonus (#1123) — effectiveMaxHitPointsForRow's own composition. */
  maxHpBonus: number;
  edition: RulesEdition;
}

function resolveSetExhaustion(
  state: ConditionsMutableState,
  op: SetExhaustionOperation,
  hpClamp: ExhaustionHpClampInputs,
): ConditionResolution & { hpAfter?: HitPoints } {
  if (!Number.isInteger(op.level)) {
    throw new InvalidConditionOperationError("setExhaustion: level must be an integer");
  }
  if (op.level < 0 || op.level > EXHAUSTION_MAX) {
    throw new InvalidConditionOperationError(`setExhaustion: level must be between 0 and ${EXHAUSTION_MAX}`);
  }
  const previous = state.exhaustion;
  state.exhaustion = op.level;

  // Decision 4 (#1321): raising exhaustion to ≥4 (PHB'14 p. 291 tier 4) halves
  // the effective max — current above it is not a legal state (PHB'14 p. 196,
  // "can be any number from the creature's hit point maximum down to 0"), so
  // this is a REAL, one-way write, carried in the event's before/after so LIFO
  // undo restores it. Dropping back below 4 does NOT hand the hit points back
  // (decision 5, PHB'14 p. 197 is a ceiling, never a floor) — that asymmetry
  // is exactly why this is a write and not a read-time-only Math.min.
  const { hp, maxHpBonus, edition } = hpClamp;
  const newEffMax = effectiveMaxHitPoints(hp.max, maxHpBonus, state.exhaustion, edition);
  const clampedCurrent = Math.min(hp.current, newEffMax);
  const hpAfter = clampedCurrent === hp.current ? undefined : { ...hp, current: clampedCurrent };

  return {
    eventType: "exhaustionSet",
    summary: `Set exhaustion to level ${op.level}`,
    eventData: { level: op.level, previous },
    hpAfter,
  };
}

// Validates + applies one condition op to `state` (mutated in place) and returns
// the audit-event fields it produced. One resolver per op-kind keeps each small;
// the strings/data are byte-identical to before (the payloads feed LIFO undo).
// `hpClamp` is only consumed by setExhaustion, `immune` only by
// applyCondition (#1121) — the other op kinds ignore whichever isn't theirs.
function resolveConditionOp(
  state: ConditionsMutableState,
  op: ConditionOperation,
  hpClamp: ExhaustionHpClampInputs,
  immune: ReadonlySet<ConditionKey>,
): ConditionResolution & { hpAfter?: HitPoints } {
  switch (op.type) {
    case "applyCondition":
      return resolveApplyCondition(state, op, immune);
    case "removeCondition":
      return resolveRemoveCondition(state, op);
    case "setExhaustion":
      return resolveSetExhaustion(state, op, hpClamp);
  }
}

// deriveImmuneConditions' own `class` sub-select fragment — shared by
// CONDITIONS_SELECT (below) and CONDITION_IN_TX_SELECT (applyConditionInTx's
// own select, #1121 review finding 2) so the two can never diverge on what
// "this character's rows" means. Never spread alongside a SECOND `class` key
// in the same select (feature-rows-select.ts's own header on why a second
// `class` key silently clobbers rather than merges) — used only as the WHOLE
// value of a `class.select`, composed with extraAsiLevels/fightingStyleFeatLevel
// where a caller needs both (CONDITIONS_SELECT).
const IMMUNE_CONDITIONS_CLASS_SELECT = {
  subclassLevel: true,
  features: FEATURE_ROWS_CLASS_FEATURES,
} satisfies Prisma.CharacterClassSelect;

// Columns/relations re-read per op (#1321 widened this from `{ conditions:
// true }` to also cover effectiveMaxHitPoints' inputs): hitPoints/hitDice for
// the HitPoints shape, resources + classEntries.class.{extraAsiLevels,
// fightingStyleFeatLevel} + experiencePoints for the feat-slot-cap dance
// deriveFeatBonuses needs (mirrors buildHpOpContext's own select — the
// fightingStyleFeatLevel column feeds inCapAdvancementsAt's fs-cap arg below),
// and rulesEdition for the edition fork itself.
// #1121 widened this from the #1321 shape to also cover deriveImmuneConditions'
// inputs: activeEffects (Mindless Rage's "rage" buff-key gate) and each entry's
// class/subclass feature rows (Beguiling Defenses/Nature's Ward/Mindless
// Rage's own conditionImmunities columns).
const CONDITIONS_SELECT = {
  conditions: true,
  hitPoints: true,
  hitDice: true,
  resources: true,
  experiencePoints: true,
  rulesEdition: true,
  activeEffects: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    // name/subclass/subclassRef.slug/class.subclassLevel (#1123):
    // draconicResilienceMaxHpTerm's identity inputs — the select and the term
    // travel together (see DraconicSorcererEntry). subclassRef.features +
    // class features via IMMUNE_CONDITIONS_CLASS_SELECT (#1121):
    // deriveImmuneConditions' inputs, composed into the SAME single
    // class/subclassRef keys (a second key would clobber, not merge).
    select: {
      level: true,
      name: true,
      subclass: true,
      subclassRef: { select: { slug: true, features: FEATURE_ROWS_SUBCLASS_FEATURES } },
      // `name` (#1148): characterFightingStyleFeatSlots' resolveSubclassSlug
      // input — the CANONICAL class name, same #1495 rationale as elsewhere.
      class: { select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, ...IMMUNE_CONDITIONS_CLASS_SELECT } },
    },
  },
} satisfies Prisma.CharacterSelect;

// applyConditionInTx's own select (#1121 review finding 2) — the immune-set
// inputs deriveImmuneConditions needs, without CONDITIONS_SELECT's HP-clamp
// columns (hitPoints/hitDice/resources), which this internal self-apply
// helper never touches.
const CONDITION_IN_TX_SELECT = {
  conditions: true,
  activeEffects: true,
  experiencePoints: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: {
      level: true,
      class: { select: IMMUNE_CONDITIONS_CLASS_SELECT },
      subclassRef: { select: { features: FEATURE_ROWS_SUBCLASS_FEATURES } },
    },
  },
} satisfies Prisma.CharacterSelect;

/**
 * The full effectiveMaxHitPoints composition for a character ROW (#1321):
 * gather the in-cap feat-slot advancements, derive the feat max-HP bonus, and
 * pair it with the row's CURRENT exhaustion level and effective max. Lives
 * HERE rather than hp-core.ts (its natural home) because hp-core.ts's own
 * inCapAdvancementsAt/effectiveMaxHitPoints are imported BY this module —
 * hp-core.ts importing normalizeConditionsMutable back would be a direct
 * cycle. buildHpOpContext (hp-context.ts) and applyHealInTx (hp-in-tx.ts) both
 * call this instead of repeating the composition inline.
 */
export function effectiveMaxHitPointsForRow(row: {
  hitPoints: Prisma.JsonValue;
  hitDice: Prisma.JsonValue;
  resources: Prisma.JsonValue;
  conditions: Prisma.JsonValue;
  rulesEdition: RulesEdition;
  experiencePoints: number;
  classEntries: readonly {
    level: number;
    name: string;
    subclass: string | null;
    subclassRef: { slug: string } | null;
    // `class.name` (#1148): characterFightingStyleFeatSlots' resolveSubclassSlug
    // input — the CANONICAL class name, same #1495 rationale as its own select.
    class: { name: string; extraAsiLevels: readonly number[]; fightingStyleFeatLevel: number | null; subclassLevel: number } | null;
  }[];
}): { hp: HitPoints; hd: HitDice; maxHpBonus: number; exhaustionLevel: number; effMax: number } {
  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const derivedLevel = levelForExperience(row.experiencePoints);
  // Real fs cap (not the Infinity default) so an over-cap fs feat is excluded
  // from the maxHp-relevant "kept" set exactly like an over-cap ASI/feat would
  // be — matches reconcileAdvancements/applyAdvancementOpInTx's fidelity.
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(row.classEntries, derivedLevel, row.rulesEdition);
  const inCapAdvancements = inCapAdvancementsAt(row.resources, row.classEntries, derivedLevel, fightingStyleSlotTotal);
  // maxHpBonus = feat bonuses (e.g. Tough) + Draconic Resilience (#1123), the
  // SAME pre-halving composition serializeCharacter's applyFeatLayer serves —
  // the subclass term routed through the ONE shared function
  // (draconicResilienceMaxHpTerm), never an inline copy.
  const maxHpBonus =
    deriveFeatBonuses(inCapAdvancements, hd.total).maxHp +
    draconicResilienceMaxHpTerm(row.classEntries, derivedLevel, row.rulesEdition);
  const exhaustionLevel = normalizeConditionsMutable(row.conditions).exhaustion;
  const effMax = effectiveMaxHitPoints(hp.max, maxHpBonus, exhaustionLevel, row.rulesEdition);
  return { hp, hd, maxHpBonus, exhaustionLevel, effMax };
}

/**
 * One class entry's own rows + its already-resolved effective level (#1121) —
 * deriveImmuneConditions' per-entry input. Kept as this plain shape (never
 * the raw Prisma `FeatureRowsEntry` payload) so the function stays a pure
 * leaf: the caller does the `featureRowsOf`/`effectiveEntryLevel` resolution
 * (the same two calls eligibleRowActions/buildResourcesView already make),
 * which is also what keeps this directly unit-testable with plain object
 * literals (conditions-immunity.test.ts) instead of a fake Prisma payload.
 */
export interface ImmuneConditionEntryRows {
  classRows: readonly ClassFeatureRow[];
  subclassRows: readonly ClassFeatureRow[];
  effLevel: number;
}

/**
 * The full immune-condition SET for a character (#1121) — the ONE shared rule
 * function `resolveApplyCondition`'s write-guard below and character-serialize.ts's
 * wire `immuneConditions` both call, so they can never independently disagree
 * on which conditions are currently blocked (the same non-negotiable
 * subclassGateLevel/effectiveMaxHitPointsForRow already model: one rule
 * function, never two inline copies). Unions two sources:
 *   - activeImmuneConditions (active-effects.ts): any currently active buff's
 *     own `conditionImmunities` (Beguiling Defenses/Nature's Ward COULD ride
 *     this if ever modeled as a buff; no production buff does today).
 *   - conditionImmunitiesFromRows, per class entry, over both that entry's
 *     class rows and its active subclass's rows: Mindless Rage (gated on the
 *     "rage" buff key), Beguiling Defenses, Nature's Ward (both unconditional).
 */
export function deriveImmuneConditions(
  entries: readonly ImmuneConditionEntryRows[],
  edition: RulesEdition,
  activeEffects: ActiveEffectsMutableState,
): ConditionKey[] {
  const activeBuffKeys = new Set(activeEffects.buffs.map((b) => b.key));
  const out = new Set<ConditionKey>();
  for (const key of activeImmuneConditions(activeEffects)) {
    if (isKnownCondition(key)) out.add(key);
  }
  for (const { classRows, subclassRows, effLevel } of entries) {
    for (const key of conditionImmunitiesFromRows(classRows, effLevel, edition, activeBuffKeys)) {
      if (isKnownCondition(key)) out.add(key);
    }
    for (const key of conditionImmunitiesFromRows(subclassRows, effLevel, edition, activeBuffKeys)) {
      if (isKnownCondition(key)) out.add(key);
    }
  }
  return [...out];
}

// The one extra scalar immuneConditionEntryRows needs beyond FeatureRowsEntry's
// own class/subclassRef relations — effectiveEntryLevel's own `entryLevel`
// input, mirroring effectiveMaxHitPointsForRow's classEntries shape.
type FeatureRowsClassEntry = FeatureRowsEntry & { level: number };

// The featureRowsOf/effectiveEntryLevel resolution deriveImmuneConditions'
// callers share — conditions.ts's own applyConditionsOperations and
// character-serialize.ts, so the two can never diverge on what "this
// character's rows" means.
export function immuneConditionEntryRows(
  classEntries: readonly FeatureRowsClassEntry[],
  totalLevel: number,
): ImmuneConditionEntryRows[] {
  return classEntries.map((entry) => {
    const effLevel = effectiveEntryLevel(entry.level, classEntries.length, totalLevel);
    const { classRows, subclassRows } = featureRowsOf(entry);
    return { classRows, subclassRows, effLevel };
  });
}

export async function applyConditionsOperations(
  characterId: string,
  operations: ConditionOperation[],
): Promise<void> {
  await runCharacterTransaction<typeof CONDITIONS_SELECT, ConditionOperation>(characterId, operations, {
    select: CONDITIONS_SELECT,
    notFound: (id) => new InvalidConditionOperationError(`Character not found: ${id}`),
    applyOp: async ({ tx, row, op, batchId, sessionId }) => {
      const state = normalizeConditionsMutable(row.conditions);
      const beforeState = deepCopy(state);

      const { hp, maxHpBonus } = effectiveMaxHitPointsForRow(row);
      const totalLevel = levelForExperience(row.experiencePoints);
      const immune = new Set(
        deriveImmuneConditions(
          immuneConditionEntryRows(row.classEntries, totalLevel),
          row.rulesEdition,
          normalizeActiveEffectsMutable(row.activeEffects),
        ),
      );

      const { eventType, summary, eventData, hpAfter } = resolveConditionOp(
        state,
        op,
        { hp, maxHpBonus, edition: row.rulesEdition },
        immune,
      );

      await tx.character.update({
        where: { id: characterId },
        data: {
          conditions: serializeConditionsState(state),
          ...(hpAfter ? { hitPoints: hpAfter as unknown as Prisma.InputJsonValue } : {}),
        },
      });

      const afterState = deepCopy(state);

      await logEvent(tx, {
        characterId,
        category: "conditions",
        type: eventType,
        summary,
        before: hpAfter ? { ...beforeState, hitPoints: hp } : beforeState,
        after: hpAfter ? { ...afterState, hitPoints: hpAfter } : afterState,
        data: eventData,
        batchId,
        sessionId,
      });
    },
  });
}

/** The two rows a gating buff's owning class entry contributes (#1121) — classRows + its active subclass's subclassRows, the same split featureRowsOf returns. */
export interface ConditionImmunityBuffRows {
  classRows: readonly ClassFeatureRow[];
  subclassRows: readonly ClassFeatureRow[];
}

// Every row (class or subclass) gating conditionImmunities on `buffKey`, at
// its own level/edition gate — the SAME gate conditionImmunitiesFromRows
// enforces for the read-time SET, so a character below Mindless Rage's level
// triggers no transition even while raging.
function rowsGatingBuff(
  rows: ConditionImmunityBuffRows,
  buffKey: string,
  effLevel: number,
  edition: RulesEdition,
): ClassFeatureRow[] {
  return [...rows.classRows, ...rows.subclassRows].filter(
    (row) =>
      row.edition === edition &&
      row.level <= effLevel &&
      row.conditionImmunitiesRequireActiveBuff === buffKey &&
      Boolean(row.conditionImmunitiesOnBuffStart) &&
      Boolean(row.conditionImmunities?.length),
  );
}

// Restore half of the suspend/restore round-trip (#1121, 2014 Mindless
// Rage): restore every `suspended` entry NOT in the caller-supplied `immune`
// set back to `active`, one at a time, dropping each from `suspended`.
// No-op when every entry is still immune (each stays suspended, waiting for
// the buff that still grants its immunity to end — that clear re-runs this).
// Each RESTORED key logs its own `conditionApplied` event with the SAME
// `{ key, source }` data shape resolveApplyCondition uses (#1121 review
// finding 4 — a single batched event with a plural `restoredKeys` array is a
// `data` shape no other `conditionApplied` event has ever carried, which the
// activity feed/undo has no reason to expect). A defensive existence check
// (finding 3) skips a key already active — applyConditionInTx's own
// suspended-dedup (finding 2) should make that unreachable, but a restore
// must never assume it held and create a duplicate `active` entry regardless.
async function restoreSuspendedConditionsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: ConditionsMutableState,
  immune: ReadonlySet<ConditionKey>,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const eligible = state.suspended.filter((s) => !immune.has(s.key));
  if (eligible.length === 0) return;

  for (const s of eligible) {
    // Defensive dedup (unreachable once the write-guard's suspended check
    // holds): the stale suspended entry is still dropped so it can't linger,
    // but with no event — nothing observably changed in `active`.
    if (state.active.some((e) => e.key === s.key)) {
      state.suspended = state.suspended.filter((e) => e !== s);
      continue;
    }
    // `before` is captured BEFORE this entry leaves `suspended` — each
    // event's before/after must snapshot exactly this step, or a LIFO undo
    // replaying event.before blobs lands on a bulk-emptied suspended[]
    // (round-3 regression: hoisting the suspended shrink above the loop
    // corrupted every restore event's snapshot).
    const before = deepCopy(state);
    state.suspended = state.suspended.filter((e) => e !== s);
    state.active.push({ key: s.key, source: s.source, appliedAt: s.appliedAt });
    await logEvent(tx, {
      characterId,
      category: "conditions",
      type: "conditionApplied",
      summary: `Restored condition: ${conditionLabel(s.key)} (${s.gatingBuffKey} ended)`,
      before,
      after: deepCopy(state),
      data: { key: s.key, source: s.source ?? null },
      batchId,
      sessionId,
    });
  }
  // Still ONE write after the loop — only the DB write is batched; the
  // state mutations and their event snapshots above are per-step.
  await tx.character.update({ where: { id: characterId }, data: { conditions: serializeConditionsState(state) } });
}

/**
 * Buff END half of the #1121 suspend/restore round-trip — called by
 * clearBuffsMatchingInTx (the private core every buff-end.ts clear* wrapper
 * funnels through) AFTER the cleared buffs are written, so no buff can end —
 * voluntarily or involuntarily, from any caller — without this running.
 * Restores every suspended condition the character is no longer immune to,
 * re-checking the CURRENT immune set through deriveImmuneConditions (the one
 * shared rule function the write-guard also uses) rather than trusting
 * `gatingBuffKey` alone: a condition still blocked by ANOTHER active buff's
 * immunity stays suspended (restoring it would recreate exactly the state
 * the write-guard forbids), and comes back when THAT buff's clear re-runs
 * this. Cheap first read: almost every buff end has nothing suspended, so
 * the feature-row/immune-set read only happens when `suspended` is non-empty.
 */
export async function restoreSuspendedConditionsForBuffEndInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const slim = await tx.character.findUnique({ where: { id: characterId }, select: { conditions: true } });
  if (!slim || normalizeConditionsMutable(slim.conditions).suspended.length === 0) return;

  const row = await tx.character.findUnique({ where: { id: characterId }, select: CONDITION_IN_TX_SELECT });
  if (!row) return;
  const state = normalizeConditionsMutable(row.conditions);
  const totalLevel = levelForExperience(row.experiencePoints);
  const immune = new Set(
    deriveImmuneConditions(
      immuneConditionEntryRows(row.classEntries, totalLevel),
      row.rulesEdition,
      normalizeActiveEffectsMutable(row.activeEffects),
    ),
  );
  await restoreSuspendedConditionsInTx(tx, characterId, state, immune, batchId, sessionId);
}

// State-transition half of syncConditionImmunityOnBuffStartInTx (#1121): for
// every row gating conditionImmunities on `buffKey` (rowsGatingBuff), remove
// any EXISTING active condition it names; `onBuffStart: "suspend"`
// additionally records it in `suspended` (2014 Mindless Rage) so
// restoreSuspendedConditionsForBuffEndInTx can bring it back on buff end,
// `"clear"` does not (2024 Mindless Rage — the condition is gone for good).
// No-op when nothing matches. Each CLEARED key logs its own `conditionRemoved`
// event with the SAME `{ key }` data shape resolveRemoveCondition uses
// (#1121 review finding 4, same rationale as restoreSuspendedConditionsInTx's
// own header). Mutates `state` and logs, but does NOT write — the caller
// (syncConditionImmunityOnBuffStartInTx) persists once across every buff key.
// Returns whether anything changed.
async function clearOrSuspendConditionsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: ConditionsMutableState,
  rows: ConditionImmunityBuffRows,
  effLevel: number,
  edition: RulesEdition,
  buffKey: string,
  batchId: string,
  sessionId: string | null,
): Promise<boolean> {
  const matching = rowsGatingBuff(rows, buffKey, effLevel, edition);
  if (matching.length === 0) return false;

  let changed = false;
  for (const matchRow of matching) {
    const suspend = suspendOnBuffStart(matchRow);
    for (const rawKey of matchRow.conditionImmunities ?? []) {
      if (!isKnownCondition(rawKey)) continue;
      changed =
        (await clearOrSuspendOneConditionInTx(tx, characterId, state, rawKey, suspend, buffKey, batchId, sessionId)) ||
        changed;
    }
  }
  return changed;
}

// Closed "clear"/"suspend" vocabulary, enforced at seed time
// (classFeatureSeedSchema) — an unknown persisted value must fail loudly,
// not silently behave as "clear" and lose the condition for good.
function suspendOnBuffStart(row: ClassFeatureRow): boolean {
  const onBuffStart = row.conditionImmunitiesOnBuffStart;
  if (onBuffStart !== "suspend" && onBuffStart !== "clear") {
    throw new Error(`Unknown conditionImmunitiesOnBuffStart ${JSON.stringify(onBuffStart)} on feature row "${row.name}"`);
  }
  return onBuffStart === "suspend";
}

// One condition's active -> gone/suspended transition + its per-step event
// (mutates `state`, no write — see clearOrSuspendConditionsInTx's header).
// Returns whether the condition was active (i.e. anything changed).
async function clearOrSuspendOneConditionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  state: ConditionsMutableState,
  key: ConditionKey,
  suspend: boolean,
  buffKey: string,
  batchId: string,
  sessionId: string | null,
): Promise<boolean> {
  const idx = state.active.findIndex((e) => e.key === key);
  if (idx === -1) return false;
  const before = deepCopy(state);
  const [entry] = state.active.splice(idx, 1);
  if (suspend) {
    state.suspended.push({ key: entry.key, source: entry.source, appliedAt: entry.appliedAt, gatingBuffKey: buffKey });
  }
  await logEvent(tx, {
    characterId,
    category: "conditions",
    type: "conditionRemoved",
    summary: `Removed condition: ${conditionLabel(entry.key)} (${buffKey} started)`,
    before,
    after: deepCopy(state),
    data: { key: entry.key },
    batchId,
    sessionId,
  });
  return true;
}

/**
 * Mindless Rage's own write-time consequence of the "rage" buff STARTING
 * (#1121, PHB'14 p.49 / SRD 5.2) — generalized to ANY row declaring
 * `conditionImmunitiesRequireActiveBuff`/`conditionImmunitiesOnBuffStart`,
 * not hardcoded to Barbarian. Called from applyRowDrivenActionInTx's toggle
 * branch (routes/character/actions.ts) right after the gating buffs are
 * applied, sharing the same batchId/sessionId — a thin wrapper over
 * clearOrSuspendConditionsInTx. Takes ALL the row's buff keys at once: one
 * conditions read and one write cover the whole set, instead of a
 * read/write pair per buff. The buff-END half needs no counterpart here:
 * clearBuffByKeyInTx (and every other buff-end.ts clear) already restores
 * suspended conditions itself.
 */
export async function syncConditionImmunityOnBuffStartInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  rows: ConditionImmunityBuffRows,
  effLevel: number,
  edition: RulesEdition,
  buffKeys: readonly string[],
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  if (buffKeys.length === 0) return;
  const row = await tx.character.findUnique({ where: { id: characterId }, select: { conditions: true } });
  if (!row) return;
  const state = normalizeConditionsMutable(row.conditions);
  let changed = false;
  for (const buffKey of buffKeys) {
    changed =
      (await clearOrSuspendConditionsInTx(tx, characterId, state, rows, effLevel, edition, buffKey, batchId, sessionId)) ||
      changed;
  }
  if (changed) {
    await tx.character.update({ where: { id: characterId }, data: { conditions: serializeConditionsState(state) } });
  }
}
