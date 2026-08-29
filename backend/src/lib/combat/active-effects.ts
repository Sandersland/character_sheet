// Buffs are logged under the "effects" event category so LIFO batch revert restores activeEffects.
import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import type { RollEffect, RollModeKind } from "@/lib/srd/roll-effects.js";

export type BuffDuration = "concentration" | "while-active" | "until-rest";

const BUFF_DURATIONS: BuffDuration[] = ["concentration", "while-active", "until-rest"];

export interface ActiveBuff {
  id: string;
  key: string;
  target: string;
  modifier: number;
  source: string;
  sourceEntryId?: string;
  // Missing on the wire means "concentration" (byte-parity with #438).
  duration: BuffDuration;
  // A long rest also clears a "short" until-rest buff.
  restType?: "short" | "long";
  resistDamageTypes?: string[];
  // Consumed by deriveImmuneConditions alongside ClassFeatureRow.conditionImmunities.
  conditionImmunities?: string[];
  rollEffects?: RollEffect[];
  // Copied from EffectBuffRow.clearOn (or BUFF_TARGET_CLEAR_ON for spells) onto the buff at creation,
  // since equipClearTriggers only ever sees persisted state.
  clearOn?: string[];
}

export interface ActiveEffectsMutableState {
  buffs: ActiveBuff[];
}

// Mirrors normalizeConditionsMutable's tolerance for null/malformed input.
function parseBuffDuration(value: unknown): BuffDuration {
  return BUFF_DURATIONS.includes(value as BuffDuration) ? (value as BuffDuration) : "concentration";
}

function parseRestType(value: unknown): "short" | "long" | undefined {
  return value === "short" || value === "long" ? value : undefined;
}

// No per-value validation here; the CLEAR_ON_TRIGGERS vocabulary is enforced at seed time by classFeatureSeedSchema.
function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value.filter((t): t is string => typeof t === "string");
  return items.length > 0 ? items : undefined;
}

const ROLL_MODE_KINDS: RollModeKind[] = ["attack", "check", "save", "initiative"];

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

// Returns undefined (not []) for byte-parity with buffs that predate this axis.
function parseRollEffects(value: unknown): RollEffect[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const effects = value.map(parseRollEffect).filter((e): e is RollEffect => e !== null);
  return effects.length > 0 ? effects : undefined;
}

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

export function buffsByTarget(state: ActiveEffectsMutableState): Record<string, ActiveBuff[]> {
  const out: Record<string, ActiveBuff[]> = {};
  for (const b of state.buffs) {
    (out[b.target] ??= []).push(b);
  }
  return out;
}

export function activeResistedDamageTypes(state: ActiveEffectsMutableState): Set<string> {
  const out = new Set<string>();
  for (const b of state.buffs) {
    for (const t of b.resistDamageTypes ?? []) out.add(t);
  }
  return out;
}

// deriveImmuneConditions is the one caller that unions this with conditionImmunitiesFromRows
// into the immune set the write-guard and wire both read.
export function activeImmuneConditions(state: ActiveEffectsMutableState): Set<string> {
  const out = new Set<string>();
  for (const b of state.buffs) {
    for (const c of b.conditionImmunities ?? []) out.add(c);
  }
  return out;
}

export function snapshotActiveEffects(state: ActiveEffectsMutableState): { activeEffects: ActiveEffectsMutableState } {
  return { activeEffects: { buffs: state.buffs.map((b) => ({ ...b })) } };
}

// Shares the caller's batchId so LIFO batch revert restores activeEffects together with the spellcasting/concentration change.
export async function appendActiveBuffInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  buff: Omit<ActiveBuff, "id">,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  // Without an explicit restType, clearBuffsForRestInTx would silently treat this as long-rest-only.
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
