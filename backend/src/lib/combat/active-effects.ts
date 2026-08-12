/**
 * Active-effects state — cast-granted passive modifiers ("buffs") that ride a
 * character until their granting concentration ends. The analog to lib/combat/conditions.ts
 * for the Character.activeEffects JSON column.
 *
 * What is persisted (Character.activeEffects JSON column):
 *   - `buffs`: list of ActiveBuff — one per active cast-granted stat modifier,
 *     tagged with `sourceEntryId` (the concentration entry that granted it) so it
 *     clears when that concentration ends. Deduped by `key` on apply (re-casting
 *     the same buff replaces, never stacks).
 *
 * Nothing here is derived from level/class. serializeCharacter sums these per
 * target into the affected skill/stat's `tempModifier`. Mutations are logged
 * under the "effects" event category so batch revert restores activeEffects.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import type { RollEffect, RollModeKind } from "@/lib/srd/roll-effects.js";

// How long a buff rides the character. "concentration" clears when its granting
// concentration ends (the #438 default). "while-active" persists until explicitly
// toggled off; "until-rest" clears on the matching rest. The latter two survive
// concentration changes — they power durable self-buffs like Rage (#458).
export type BuffDuration = "concentration" | "while-active" | "until-rest";

const BUFF_DURATIONS: BuffDuration[] = ["concentration", "while-active", "until-rest"];

/** One active cast-granted passive modifier. Deduped by `key` on apply. */
export interface ActiveBuff {
  /** Per-buff instance id. */
  id: string;
  /** Buff identity — re-applying the same key replaces (never stacks). */
  key: string;
  /** Skill/ability/stat key the modifier applies to (e.g. "athletics", "meleeDamage"). */
  target: string;
  /** Flat modifier added to the target. */
  modifier: number;
  /** Human-readable provenance, e.g. the granting spell's name. */
  source: string;
  /** Concentration entry id that granted this buff; clears when it ends. */
  sourceEntryId?: string;
  /** Duration axis; missing on the wire means "concentration" (byte-parity with #438). */
  duration: BuffDuration;
  /** Which rest clears an "until-rest" buff. Long rest also clears "short". */
  restType?: "short" | "long";
  /** Damage types this buff makes the character resistant to (halved on take), e.g. Rage's b/p/s (#456). */
  resistDamageTypes?: string[];
  /** Condition keys this buff makes the character immune to while active (#1121) — mirrors resistDamageTypes. No production buff sets this yet (Mindless Rage's immunity is subclass-gated, so it rides ClassFeatureRow.conditionImmunities instead, see deriveImmuneConditions); a universally-immune buff (any character granted it, no subclass gate) is this field's consumer. */
  conditionImmunities?: string[];
  /** State-driven advantage/disadvantage grants (#486), e.g. Rage's advantage on Strength checks & saves. */
  rollEffects?: RollEffect[];
  /**
   * Equip-time trigger keys that true-end this buff (#1688) — copied from the
   * granting row's `EffectBuffRow.clearOn` (or, for a Spell buff, set at cast
   * time by ability-cast.ts's BUFF_TARGET_CLEAR_ON) onto the instantiated
   * buff, since the equip hook only ever sees persisted state, never the
   * row/spell that granted it. Matched by inventory-placement.ts's
   * equipClearTriggers against whatever the placement just raised.
   */
  clearOn?: string[];
}

export interface ActiveEffectsMutableState {
  buffs: ActiveBuff[];
}

// Tolerant of null (character has never had a buff) and of malformed entries
// (dropped). Mirror of normalizeConditionsMutable.

function parseBuffDuration(value: unknown): BuffDuration {
  return BUFF_DURATIONS.includes(value as BuffDuration) ? (value as BuffDuration) : "concentration";
}

function parseRestType(value: unknown): "short" | "long" | undefined {
  return value === "short" || value === "long" ? value : undefined;
}

// Shared by resistDamageTypes and clearOn (#1688) — both are "list of
// strings, empty/absent -> undefined" with no further per-value validation
// here (the closed CLEAR_ON_TRIGGERS vocabulary is enforced at SEED time,
// classFeatureSeedSchema; an unmatched trigger on read is a safe no-op, same
// as an unknown damage type would be).
function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((t): t is string => typeof t === "string");
  return items.length > 0 ? items : undefined;
}

const ROLL_MODE_KINDS: RollModeKind[] = ["attack", "check", "save", "initiative"];

// One state-driven roll grant (#486); null when the entry is malformed.
function parseRollEffect(raw: unknown): RollEffect | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  if (entry.mode !== "advantage" && entry.mode !== "disadvantage") return null;
  if (!ROLL_MODE_KINDS.includes(entry.kind as RollModeKind)) return null;
  return {
    mode: entry.mode,
    kind: entry.kind as RollModeKind,
    ...(typeof entry.ability === "string" ? { ability: entry.ability } : {}),
  };
}

// Parse the state-driven roll grants (#486). Drops malformed entries; returns
// undefined when none survive (byte-parity with buffs that predate the axis).
function parseRollEffects(value: unknown): RollEffect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const effects = value.map(parseRollEffect).filter((e): e is RollEffect => e !== null);
  return effects.length > 0 ? effects : undefined;
}

// Build a valid ActiveBuff from a validated entry (key/target are strings, modifier finite).
function buildBuff(entry: Record<string, unknown>, key: string, target: string, modifier: number): ActiveBuff {
  const restType = parseRestType(entry.restType);
  const resistDamageTypes = parseStringArray(entry.resistDamageTypes);
  const conditionImmunities = parseStringArray(entry.conditionImmunities);
  const rollEffects = parseRollEffects(entry.rollEffects);
  const clearOn = parseStringArray(entry.clearOn);
  return {
    id: typeof entry.id === "string" ? entry.id : randomUUID(),
    key,
    target,
    modifier,
    source: typeof entry.source === "string" ? entry.source : key,
    sourceEntryId: typeof entry.sourceEntryId === "string" ? entry.sourceEntryId : undefined,
    duration: parseBuffDuration(entry.duration),
    ...(restType ? { restType } : {}),
    ...(resistDamageTypes ? { resistDamageTypes } : {}),
    ...(conditionImmunities ? { conditionImmunities } : {}),
    ...(rollEffects ? { rollEffects } : {}),
    ...(clearOn ? { clearOn } : {}),
  };
}

// Parse one raw buff entry; returns null for malformed input (dropped by the caller).
function normalizeBuff(raw: unknown): ActiveBuff | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const { key, target } = entry;
  if (typeof key !== "string" || typeof target !== "string") return null;
  const modifier = Number(entry.modifier);
  if (!Number.isFinite(modifier)) return null;
  return buildBuff(entry, key, target, Math.trunc(modifier));
}

export function normalizeActiveEffectsMutable(json: Prisma.JsonValue): ActiveEffectsMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { buffs: [] };
  }
  const rawBuffs = Array.isArray((json as Record<string, unknown>).buffs)
    ? ((json as Record<string, unknown>).buffs as unknown[])
    : [];

  const buffs: ActiveBuff[] = [];
  for (const raw of rawBuffs) {
    const buff = normalizeBuff(raw);
    if (buff) buffs.push(buff);
  }
  return { buffs };
}

// The fields a serialized buff writes only when present, each with its own
// omission rule (a bare truthy check would wrongly keep "concentration" or an
// empty array) — a data-driven table instead of N inline conditional spreads
// keeps serializeActiveEffectsState's own branching budget low (fallow's
// cyclomatic/CRAP gate) as this list grows (#438 shipped 2, #1688 is the 5th).
const OPTIONAL_BUFF_FIELDS: ReadonlyArray<{ key: keyof ActiveBuff; include: (b: ActiveBuff) => boolean }> = [
  { key: "duration", include: (b) => b.duration !== "concentration" },
  { key: "restType", include: (b) => Boolean(b.restType) },
  { key: "resistDamageTypes", include: (b) => Boolean(b.resistDamageTypes?.length) },
  { key: "conditionImmunities", include: (b) => Boolean(b.conditionImmunities?.length) },
  { key: "rollEffects", include: (b) => Boolean(b.rollEffects?.length) },
  { key: "clearOn", include: (b) => Boolean(b.clearOn?.length) },
];

function serializeOptionalBuffFields(b: ActiveBuff): Record<string, unknown> {
  const extra: Record<string, unknown> = {};
  for (const field of OPTIONAL_BUFF_FIELDS) {
    if (field.include(b)) extra[field.key] = b[field.key];
  }
  return extra;
}

/** Serialize to the shape written to Character.activeEffects. */
export function serializeActiveEffectsState(state: ActiveEffectsMutableState): Prisma.InputJsonValue {
  return {
    buffs: state.buffs.map((b) => ({
      id: b.id,
      key: b.key,
      target: b.target,
      modifier: b.modifier,
      source: b.source,
      sourceEntryId: b.sourceEntryId ?? null,
      ...serializeOptionalBuffFields(b),
    })),
  } as unknown as Prisma.InputJsonValue;
}

/** Group active buffs by their target key. */
export function buffsByTarget(state: ActiveEffectsMutableState): Record<string, ActiveBuff[]> {
  const out: Record<string, ActiveBuff[]> = {};
  for (const b of state.buffs) {
    (out[b.target] ??= []).push(b);
  }
  return out;
}

/**
 * Self-scoped resistance registry: the set of damage types the character's
 * active buffs currently resist (#456). Fed purely by buff data — no hardcoded
 * class rules — so any effect declaring `resistDamageTypes` contributes.
 */
export function activeResistedDamageTypes(state: ActiveEffectsMutableState): Set<string> {
  const out = new Set<string>();
  for (const b of state.buffs) {
    for (const t of b.resistDamageTypes ?? []) out.add(t);
  }
  return out;
}

/**
 * Self-scoped condition-immunity registry (#1121): the set of condition keys
 * the character's active buffs currently grant immunity to. Mirrors
 * activeResistedDamageTypes exactly — fed purely by buff data, no hardcoded
 * class rules. deriveImmuneConditions (lib/combat/conditions.ts) is the ONE
 * caller that unions this with the row-declared half
 * (conditionImmunitiesFromRows, class-feature-rows.ts) into the immune set
 * the write-guard and the wire both read.
 */
export function activeImmuneConditions(state: ActiveEffectsMutableState): Set<string> {
  const out = new Set<string>();
  for (const b of state.buffs) {
    for (const c of b.conditionImmunities ?? []) out.add(c);
  }
  return out;
}

/** Snapshot of the state under the `activeEffects` key, for event before/after. */
export function snapshotActiveEffects(state: ActiveEffectsMutableState): { activeEffects: ActiveEffectsMutableState } {
  return { activeEffects: { buffs: state.buffs.map((b) => ({ ...b })) } };
}

// Self-contained read → mutate → write → log against the activeEffects column,
// sharing the caller's batchId so batch revert (category "effects" branch)
// restores activeEffects together with the spellcasting/concentration change.

/**
 * Append a buff, replacing any existing buff with the same `key` (re-casting the
 * same buff replaces, never stacks). Always writes + logs a `buffApplied` event
 * under the "effects" category.
 */
export async function appendActiveBuffInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  buff: Omit<ActiveBuff, "id">,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  // An "until-rest" buff must declare which rest clears it; without a restType
  // clearBuffsForRestInTx would silently treat it as long-rest-only. Fail loudly
  // rather than defaulting a caller's intent.
  if (buff.duration === "until-rest" && !buff.restType) {
    throw new Error(`appendActiveBuffInTx: "until-rest" buff "${buff.key}" requires an explicit restType ("short" | "long")`);
  }

  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { activeEffects: true },
  });
  if (!row) return;

  const state = normalizeActiveEffectsMutable(row.activeEffects);
  const before = snapshotActiveEffects(state);
  // Dedupe by key — re-casting replaces the prior instance.
  state.buffs = state.buffs.filter((b) => b.key !== buff.key);
  state.buffs.push({ id: randomUUID(), ...buff });

  await tx.character.update({
    where: { id: characterId },
    data: { activeEffects: serializeActiveEffectsState(state) },
  });

  await logEvent(tx, {
    characterId,
    category: "effects",
    type: "buffApplied",
    summary: `${buff.source}: ${buff.modifier >= 0 ? "+" : ""}${buff.modifier} to ${buff.target}`,
    before,
    after: snapshotActiveEffects(state),
    data: { key: buff.key, target: buff.target, modifier: buff.modifier, sourceEntryId: buff.sourceEntryId ?? null },
    batchId,
    sessionId,
  });
}
