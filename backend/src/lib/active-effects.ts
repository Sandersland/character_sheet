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

import { Prisma } from "../generated/prisma/client.js";
import { logEvent } from "./events.js";

// ── Canonical mutable state shape ─────────────────────────────────────────────

/** One active cast-granted passive modifier. Deduped by `key` on apply. */
export interface ActiveBuff {
  /** Per-buff instance id. */
  id: string;
  /** Buff identity — re-applying the same key replaces (never stacks). */
  key: string;
  /** Skill/ability/stat key the modifier applies to (e.g. "athletics"). */
  target: string;
  /** Flat modifier added to the target. */
  modifier: number;
  /** Human-readable provenance, e.g. the granting spell's name. */
  source: string;
  /** Concentration entry id that granted this buff; clears when it ends. */
  sourceEntryId?: string;
}

export interface ActiveEffectsMutableState {
  buffs: ActiveBuff[];
}

// ── Normalizer ────────────────────────────────────────────────────────────────
// Tolerant of null (character has never had a buff) and of malformed entries
// (dropped). Mirror of normalizeConditionsMutable.

export function normalizeActiveEffectsMutable(json: Prisma.JsonValue): ActiveEffectsMutableState {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { buffs: [] };
  }
  const obj = json as Record<string, unknown>;
  const rawBuffs = Array.isArray(obj.buffs) ? (obj.buffs as unknown[]) : [];

  const buffs: ActiveBuff[] = [];
  for (const raw of rawBuffs) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Record<string, unknown>;
    if (typeof entry.key !== "string" || typeof entry.target !== "string") continue;
    const modifier = Number(entry.modifier);
    if (!Number.isFinite(modifier)) continue;
    buffs.push({
      id: typeof entry.id === "string" ? entry.id : randomUUID(),
      key: entry.key,
      target: entry.target,
      modifier: Math.trunc(modifier),
      source: typeof entry.source === "string" ? entry.source : entry.key,
      sourceEntryId: typeof entry.sourceEntryId === "string" ? entry.sourceEntryId : undefined,
    });
  }

  return { buffs };
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
 * same buff replaces, never stacks). No-op if nothing changes. Logs a
 * `buffApplied` event under the "effects" category.
 */
export async function appendActiveBuffInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  buff: Omit<ActiveBuff, "id">,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
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
  const row = await tx.character.findUnique({
    where: { id: characterId },
    select: { activeEffects: true },
  });
  if (!row) return;

  const state = normalizeActiveEffectsMutable(row.activeEffects);
  const dropped = state.buffs.filter((b) => b.sourceEntryId === sourceEntryId);
  if (dropped.length === 0) return;
  const before = snapshot(state);
  state.buffs = state.buffs.filter((b) => b.sourceEntryId !== sourceEntryId);

  await tx.character.update({
    where: { id: characterId },
    data: { activeEffects: serializeActiveEffectsState(state) },
  });

  await logEvent(tx, {
    characterId,
    category: "effects",
    type: "buffCleared",
    summary: `Cleared ${dropped.length} buff${dropped.length !== 1 ? "s" : ""} (${reason})`,
    before,
    after: snapshot(state),
    data: { sourceEntryId, reason, clearedKeys: dropped.map((b) => b.key) },
    batchId,
    sessionId,
  });
}
