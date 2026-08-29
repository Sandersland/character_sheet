// Concentration is intentionally separate from conditions (tracked in spellcasting).
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

export interface ConditionEntry {
  key: ConditionKey;
  source?: string;
  appliedAt: string;
}

// A condition suspended (not cured) by a while-active buff starting, restored when that buff ends
// (PHB'14 p.49 Mindless Rage). Distinct from `active`: ignored by buildRollModifiers/the write-guard.
// restoreSuspendedConditionsForBuffEndInTx runs inside every clear* wrapper and restores each entry
// once deriveImmuneConditions no longer blocks it; an entry still immune via ANOTHER active buff stays
// suspended until that one ends too.
export interface SuspendedConditionEntry {
  key: ConditionKey;
  source?: string;
  appliedAt: string;
  gatingBuffKey: string;
}

export interface ConditionsMutableState {
  active: ConditionEntry[];
  // 6 = death; not part of `active`.
  exhaustion: number;
  suspended: SuspendedConditionEntry[];
}

// Shared by both normalizers below so parsing isn't duplicated; null means the raw entry isn't
// shaped like a condition at all (dropped by both, clamp-on-read).
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
    // Dedupe by key (clamp-on-read); unknown-key rejection already happened in parseConditionEntryBase.
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
    // Dedupe by key (clamp-on-read), mirroring normalizeConditionEntryList.
    if (!entry || typeof gatingBuffKey !== "string" || gatingBuffKey.length === 0 || seen.has(entry.key)) continue;
    seen.add(entry.key);
    out.push({ ...entry, gatingBuffKey });
  }
  return out;
}

// Mirrors normalizeResourcesMutable's tolerance for null/malformed input.
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

// Route every update through this helper so all keys round-trip.
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

// Shares the caller's batchId so batch revert restores conditions; idempotent (no-op, no event) when already present.
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
  // Idempotent against `suspended` too, not just `active` — otherwise a second self-apply could push
  // a duplicate while an older instance sits suspended, permanently stranding the restore.
  if (state.active.some((e) => e.key === key) || state.suspended.some((s) => s.key === key)) return;
  // Mirrors resolveApplyCondition's immunity guard, but silently no-ops instead of throwing — this is
  // a best-effort side effect of an unrelated ability, not a validated user action.
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

// Mirrors applyResourceOperations: one batchId per request, any throw rolls back the whole batch,
// one CharacterEvent per op for LIFO undo.
// Split from the transaction closure to keep applyConditionsOperations a thin pipeline; event data
// stays byte-identical since it feeds LIFO undo.
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
  // A suspended condition still exists, so re-applying it is rejected like an active duplicate; the
  // immunity guard below doesn't cover this since the gate can lapse (e.g. a level-down) while the
  // suspension persists.
  if (state.suspended.some((s) => s.key === op.key)) {
    throw new InvalidConditionOperationError(`Condition already suspended: ${conditionLabel(op.key)}`);
  }
  // Blocked, not auto-cleared: an auto-clear-with-audit would produce a confusing history for a state that was never legal.
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

// The same maxHpBonus/edition composition buildHpOpContext assembles, gathered independently here via the same shared rule functions.
interface ExhaustionHpClampInputs {
  hp: HitPoints;
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

  // Exhaustion tier 4+ (PHB'14 p.291) halves the effective max; HP above it is illegal (PHB'14 p.196), so this is
  // a real one-way write (carried in the event for LIFO undo) — dropping back below tier 4 does not refund the HP
  // (PHB'14 p.197 is a ceiling, never a floor).
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

// hpClamp is only consumed by setExhaustion, immune only by applyCondition; other op kinds ignore whichever isn't theirs.
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

// Shared by CONDITIONS_SELECT and CONDITION_IN_TX_SELECT so they can't diverge on what "this character's
// rows" means. Never spread alongside a second `class` key in the same select — Prisma clobbers rather than merges.
const IMMUNE_CONDITIONS_CLASS_SELECT = {
  subclassLevel: true,
  features: FEATURE_ROWS_CLASS_FEATURES,
} satisfies Prisma.CharacterClassSelect;

// Mirrors buildHpOpContext's select for the HP-clamp inputs, plus activeEffects + feature rows for deriveImmuneConditions.
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
    // This shape must travel with draconicResilienceMaxHpTerm's DraconicSorcererEntry input.
    select: {
      level: true,
      name: true,
      subclass: true,
      subclassRef: { select: { slug: true, features: FEATURE_ROWS_SUBCLASS_FEATURES } },
      // The canonical class name characterFightingStyleFeatSlots' resolveSubclassSlug expects.
      class: { select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, ...IMMUNE_CONDITIONS_CLASS_SELECT } },
    },
  },
} satisfies Prisma.CharacterSelect;

// Only deriveImmuneConditions' inputs, without CONDITIONS_SELECT's HP-clamp columns this internal helper never touches.
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

// Lives here, not alongside inCapAdvancementsAt/effectiveMaxHitPoints (its natural home), to avoid an
// import cycle, since those are imported by this module.
// buildHpOpContext and applyHealInTx both call this instead of repeating the composition inline.
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
    class: { name: string; extraAsiLevels: readonly number[]; fightingStyleFeatLevel: number | null; subclassLevel: number } | null;
  }[];
}): { hp: HitPoints; hd: HitDice; maxHpBonus: number; exhaustionLevel: number; effMax: number } {
  const hp = normalizeHitPoints(row.hitPoints);
  const hd = normalizeHitDice(row.hitDice);
  const derivedLevel = levelForExperience(row.experiencePoints);
  // A real fs cap (not the Infinity default) so an over-cap fs feat is excluded, matching
  // reconcileAdvancements/applyAdvancementOpInTx's fidelity.
  const fightingStyleSlotTotal = characterFightingStyleFeatSlots(row.classEntries, derivedLevel, row.rulesEdition);
  const inCapAdvancements = inCapAdvancementsAt(row.resources, row.classEntries, derivedLevel, fightingStyleSlotTotal);
  // The same pre-halving composition serializeCharacter's applyFeatLayer serves; the subclass term
  // always routes through draconicResilienceMaxHpTerm, never an inline copy.
  const maxHpBonus =
    deriveFeatBonuses(inCapAdvancements, hd.total).maxHp +
    draconicResilienceMaxHpTerm(row.classEntries, derivedLevel, row.rulesEdition);
  const exhaustionLevel = normalizeConditionsMutable(row.conditions).exhaustion;
  const effMax = effectiveMaxHitPoints(hp.max, maxHpBonus, exhaustionLevel, row.rulesEdition);
  return { hp, hd, maxHpBonus, exhaustionLevel, effMax };
}

// A plain shape, not the raw Prisma payload, so deriveImmuneConditions stays a pure leaf, testable with plain literals.
export interface ImmuneConditionEntryRows {
  classRows: readonly ClassFeatureRow[];
  subclassRows: readonly ClassFeatureRow[];
  effLevel: number;
}

// The one shared rule function resolveApplyCondition and serializeCharacter's wire immuneConditions
// both call, so they can never independently disagree (the subclassGateLevel/effectiveMaxHitPointsForRow
// pattern: one rule function, never two inline copies). Unions activeImmuneConditions (active buffs) with
// conditionImmunitiesFromRows (each entry's class + active subclass rows).
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

// effectiveEntryLevel's own entryLevel input, mirroring effectiveMaxHitPointsForRow's classEntries shape.
type FeatureRowsClassEntry = FeatureRowsEntry & { level: number };

// Shared by applyConditionsOperations and serializeCharacter so the two can never diverge on
// what "this character's rows" means.
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

// The same classRows/subclassRows split featureRowsOf returns.
export interface ConditionImmunityBuffRows {
  classRows: readonly ClassFeatureRow[];
  subclassRows: readonly ClassFeatureRow[];
}

// The same level/edition gate conditionImmunitiesFromRows enforces for the read-time set, so a
// character below the granting level triggers no transition even while raging.
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

// Each restored key logs its own conditionApplied event with the same { key, source } shape
// resolveApplyCondition uses, rather than one batched event — matches what the activity feed/undo
// already expects. A defensive existence check skips a key already active, even though
// applyConditionInTx's dedup should make that unreachable.
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
    if (state.active.some((e) => e.key === s.key)) {
      state.suspended = state.suspended.filter((e) => e !== s);
      continue;
    }
    // `before` must be captured BEFORE this entry leaves `suspended`, per iteration — hoisting the
    // removal above the loop corrupts every restore event's snapshot for LIFO undo.
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
  // Only the DB write is batched; the state mutations and their event snapshots above are per-step.
  await tx.character.update({ where: { id: characterId }, data: { conditions: serializeConditionsState(state) } });
}

// Called by clearBuffsMatchingInTx AFTER the cleared buffs are written, so no buff can end without this running.
// Re-checks the CURRENT immune set via deriveImmuneConditions rather than trusting gatingBuffKey alone — a
// condition still blocked by ANOTHER active buff stays suspended. Cheap first read: the feature-row/immune-set
// read only happens when `suspended` is non-empty.
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

// onBuffStart "suspend" (2014 Mindless Rage) records the condition in `suspended` so
// restoreSuspendedConditionsForBuffEndInTx can bring it back; "clear" (2024) does not — the condition
// is gone for good. Mutates `state` and logs but does NOT write; the caller persists once across every buff key.
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

// Closed "clear"/"suspend" vocabulary, enforced at seed time (classFeatureSeedSchema) — an unknown
// persisted value must fail loudly, not silently behave as "clear" and lose the condition for good.
function suspendOnBuffStart(row: ClassFeatureRow): boolean {
  const onBuffStart = row.conditionImmunitiesOnBuffStart;
  if (onBuffStart !== "suspend" && onBuffStart !== "clear") {
    throw new Error(`Unknown conditionImmunitiesOnBuffStart ${JSON.stringify(onBuffStart)} on feature row "${row.name}"`);
  }
  return onBuffStart === "suspend";
}

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

// Generalized to ANY row declaring conditionImmunitiesRequireActiveBuff/conditionImmunitiesOnBuffStart, not
// hardcoded to Barbarian (PHB'14 p.49 / SRD 5.2 Mindless Rage). Called from applyRowDrivenActionInTx's toggle
// branch, sharing its batchId/sessionId; takes all the row's buff keys at once for one read + one write.
// No buff-end counterpart needed: every clear* wrapper already restores suspended conditions itself.
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
