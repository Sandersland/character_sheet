/**
 * Active-effects state — cast-granted passive modifiers ("buffs") that ride a
 * character until their granting concentration ends. The analog to lib/conditions.ts
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
import { logEvent } from "./events.js";

// ── Canonical mutable state shape ─────────────────────────────────────────────

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
}

export interface ActiveEffectsMutableState {
  buffs: ActiveBuff[];
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Tolerant of null (character has never had a buff) and of malformed entries
// (dropped). Mirror of normalizeConditionsMutable.

function parseBuffDuration(value: unknown): BuffDuration {
  return BUFF_DURATIONS.includes(value as BuffDuration) ? (value as BuffDuration) : "concentration";
}

function parseRestType(value: unknown): "short" | "long" | undefined {
  return value === "short" || value === "long" ? value : undefined;
}

function parseResistDamageTypes(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const types = value.filter((t): t is string => typeof t === "string");
  return types.length > 0 ? types : undefined;
}

// Build a valid ActiveBuff from a validated entry (key/target are strings, modifier finite).
function buildBuff(entry: Record<string, unknown>, key: string, target: string, modifier: number): ActiveBuff {
  const restType = parseRestType(entry.restType);
  const resistDamageTypes = parseResistDamageTypes(entry.resistDamageTypes);
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

/** Serialize to the shape written to Character.activeEffects. */
export function serializeActiveEffectsState(state: ActiveEffectsMutableState): Prisma.InputJsonValue {
  // "concentration" duration + absent restType are omitted so #438 buffs keep
  // byte-parity with their pre-duration serialization.
  return {
    buffs: state.buffs.map((b) => ({
      id: b.id,
      key: b.key,
      target: b.target,
      modifier: b.modifier,
      source: b.source,
      sourceEntryId: b.sourceEntryId ?? null,
      ...(b.duration !== "concentration" ? { duration: b.duration } : {}),
      ...(b.restType ? { restType: b.restType } : {}),
      ...(b.resistDamageTypes && b.resistDamageTypes.length > 0 ? { resistDamageTypes: b.resistDamageTypes } : {}),
    })),
  } as unknown as Prisma.InputJsonValue;
}

// ── Pure summarizers ──────────────────────────────────────────────────────────

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

/** Snapshot of the state under the `activeEffects` key, for event before/after. */
function snapshot(state: ActiveEffectsMutableState): { activeEffects: ActiveEffectsMutableState } {
  return { activeEffects: { buffs: state.buffs.map((b) => ({ ...b })) } };
}

// ── Transaction helpers ─────────────────────────────────────────────────────
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
  const before = snapshot(state);
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
    after: snapshot(state),
    data: { key: buff.key, target: buff.target, modifier: buff.modifier, sourceEntryId: buff.sourceEntryId ?? null },
    batchId,
    sessionId,
  });
}

// Plural buff count phrase, e.g. "1 buff" / "3 buffs".
function buffCount(n: number): string {
  return `${n} buff${n !== 1 ? "s" : ""}`;
}

// Builds the `buffCleared` event's summary + data from the buffs it dropped.
interface BuffClearDescribe {
  summary: (dropped: ActiveBuff[]) => string;
  data: (dropped: ActiveBuff[]) => Record<string, unknown>;
}

/**
 * Shared core for every clear* wrapper: read → filter by `predicate` → (no-op +
 * no event when nothing matches) → write → log one `buffCleared` event under the
 * "effects" category. `describe` supplies the wrapper-specific summary + data
 * keys so the exact event payload each caller has always written is preserved.
 */
async function clearBuffsMatchingInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  predicate: (b: ActiveBuff) => boolean,
  describe: BuffClearDescribe,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { activeEffects: true },
  });
  if (!row) return;

  const state = normalizeActiveEffectsMutable(row.activeEffects);
  const dropped = state.buffs.filter(predicate);
  if (dropped.length === 0) return;
  const before = snapshot(state);
  state.buffs = state.buffs.filter((b) => !predicate(b));

  await tx.character.update({
    where: { id: characterId },
    data: { activeEffects: serializeActiveEffectsState(state) },
  });

  await logEvent(tx, {
    characterId,
    category: "effects",
    type: "buffCleared",
    summary: describe.summary(dropped),
    before,
    after: snapshot(state),
    data: describe.data(dropped),
    batchId,
    sessionId,
  });
}

/**
 * Clear every buff granted by `sourceEntryId` (the concentration that just
 * ended). No-op + no event when none match. Logs a `buffCleared` event under
 * the "effects" category so batch revert restores the dropped buffs.
 */
export async function clearBuffsForSourceInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  sourceEntryId: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<void> {
  // Only concentration-duration buffs clear when a concentration ends; durable
  // (while-active / until-rest) buffs survive concentration changes (#455).
  await clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.sourceEntryId === sourceEntryId && b.duration === "concentration",
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${reason})`,
      data: (dropped) => ({ sourceEntryId, reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

/**
 * Clear the buff with the given `key` (toggle off a durable self-buff, e.g. end
 * Rage). No-op + no event when none match. Logs a `buffCleared` event under the
 * "effects" category so batch revert restores it.
 */
export async function clearBuffByKeyInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  key: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<void> {
  // Durable-only toggle: never clear a concentration buff (those end via
  // clearBuffsForSourceInTx). Dedup-by-key keeps one buff per key today, but the
  // guard makes the "durable only" contract machine-readable if that ever relaxes.
  await clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.key === key && b.duration !== "concentration",
    {
      summary: (dropped) => `Cleared ${dropped[0].source} (${reason})`,
      data: (dropped) => ({ key, reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

/**
 * Clear every non-concentration durable buff aimed at a given target — used for a
 * true-end hook that keys on the buff's *effect* rather than a per-character key
 * (e.g. donning body armor ends Mage Armor, an "acUnarmoredBase" buff, #363; the
 * equip path can't know the caster's per-character spell entry id). No-op + no
 * event when none match. Logs a `buffCleared` event under "effects".
 */
export async function clearBuffsByTargetInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  target: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<void> {
  // Concentration buffs end via clearBuffsForSourceInTx; leave them alone here.
  await clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.target === target && b.duration !== "concentration",
    {
      summary: (dropped) => `Cleared ${dropped[0].source} (${reason})`,
      data: (dropped) => ({ target, reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

/**
 * Clear every "while-active" durable buff (e.g. Rage). Called when a blanket
 * event ends all combat self-buffs — falling unconscious (0 HP) or a long rest.
 * No-op + no event when none match. Logs a `buffCleared` event under "effects".
 */
export async function clearWhileActiveBuffsInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  batchId: string,
  sessionId: string | null,
  reason: string,
): Promise<void> {
  await clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.duration === "while-active",
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${reason})`,
      data: (dropped) => ({ reason, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}

/**
 * Clear every "until-rest" buff the given rest ends. A long rest clears both
 * "short" and "long" restType buffs; a short rest clears only "short". No-op +
 * no event when none match. Logs a `buffCleared` event under "effects".
 */
export async function clearBuffsForRestInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  restType: "short" | "long",
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  await clearBuffsMatchingInTx(
    tx,
    characterId,
    (b) => b.duration === "until-rest" && (restType === "long" || b.restType === "short"),
    {
      summary: (dropped) => `Cleared ${buffCount(dropped.length)} (${restType} rest)`,
      data: (dropped) => ({ restType, reason: `${restType}Rest`, clearedKeys: dropped.map((b) => b.key) }),
    },
    batchId,
    sessionId,
  );
}
