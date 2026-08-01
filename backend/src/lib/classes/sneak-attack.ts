// Sneak Attack cast handler — the rogue counterpart to applyManeuverOperations.
// Sneak Attack spends no pool; it rolls the level-derived Nd6 server-side, adds
// it to the rogue's OWN damage (no enemy state), and logs a roll event. The two
// 5e rules — the Nd6 progression and the once-per-turn + eligibility guard —
// live in THIS file (relocated from lib/classes/rogue.ts, #1231 commit 3 of 4,
// behaviour-neutral — the numbers below are unchanged: SRD 5.2 keeps 1d6 per 2
// levels, capped 10d6 at L19, same as SRD 5.1).

import type { RollSneakAttackOperation, SneakAttackOperation } from "@character-sheet/contracts";

import { readEffectSpec, resolveEffectSpec, type ClassDieResolver, type EffectRow } from "@/lib/combat/effects.js";
import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";

// Sneak Attack is a C5 referenced-class-die consumer: a fixed d6 whose COUNT is
// rogue-level-derived. The die is resolved through the same effects.ts machinery
// (effectDieSource + ClassDieResolver + readEffectSpec) the Battle Master uses,
// but the rogue die never grows, so it needs no resolveClassDie pool.
export const SNEAK_ATTACK_DIE_SOURCE = "sneakAttackDice";

// 1d6 at L1, +1d6 every odd level, capped at 10d6 from L19. 0 below L1.
export function sneakAttackDiceCount(rogueLevel: number): number {
  if (rogueLevel < 1) return 0;
  return Math.min(10, Math.ceil(rogueLevel / 2));
}

// The referenced-class-die resolver for the C5 machinery: the rogue die is a
// flat d6 (never scales with level, unlike the superiority die).
export const resolveSneakAttackDie: ClassDieResolver = (source) =>
  source === SNEAK_ATTACK_DIE_SOURCE ? 6 : null;

function sneakAttackEffectRow(rogueLevel: number): EffectRow {
  return {
    level: 1,
    effectKind: "damage",
    effectDiceCount: sneakAttackDiceCount(rogueLevel),
    effectDieSource: SNEAK_ATTACK_DIE_SOURCE,
  };
}

// The resolved Nd6 dice for a rogue's Sneak Attack, or null below L1. Routes
// through readEffectSpec/resolveEffectSpec so the die-source resolution matches
// every other referenced-class-die effect.
export function sneakAttackSpec(rogueLevel: number): { count: number; faces: number; modifier: number } | null {
  if (sneakAttackDiceCount(rogueLevel) <= 0) return null;
  const spec = readEffectSpec(sneakAttackEffectRow(rogueLevel), resolveSneakAttackDie);
  // characterLevel receives rogueLevel: die faces (d6) never scale with level —
  // only the count does, already baked into effectDiceCount above.
  return resolveEffectSpec(spec, 0, { characterLevel: rogueLevel });
}

// Once-per-turn + eligibility guard. Eligibility (advantage OR an ally adjacent
// to the target) is a manual assertion — never auto-detected from board state.
export function canApplySneakAttack(input: { eligible: boolean; usedThisTurn: boolean }): boolean {
  return input.eligible && !input.usedThisTurn;
}

// Sneak Attack scales with ROGUE class levels, not total character level.
function rogueLevel(entries: { name: string; level: number }[]): number {
  return entries.find((c) => c.name.toLowerCase() === "rogue")?.level ?? 0;
}

// Shared entry point for both this file's own rollSneakAttack (fed a Prisma
// row's classEntries) and character-serialize.ts's sneakAttackRider (fed the
// serialized classEntries list) — the ONE place that resolves "which class
// entry is the rogue" and hands its level to sneakAttackSpec, so neither
// caller repeats the `name.toLowerCase() === "rogue"` lookup itself
// (#1231 commit 3: this is what lets character-serialize.ts drop its own
// `\brogue\b` literal entirely).
export function sneakAttackSpecForEntries(
  classEntries: { name: string; level: number }[],
): { count: number; faces: number; modifier: number } | null {
  return sneakAttackSpec(rogueLevel(classEntries));
}

export class InvalidSneakAttackOperationError extends Error {}

export interface SneakAttackRollResult {
  roll: number;
  dice: number;
  faces: number;
  summary: string;
}

const SNEAK_ATTACK_SELECT = {
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true },
  },
} satisfies Prisma.CharacterSelect;

type SneakAttackRow = Prisma.CharacterGetPayload<{ select: typeof SNEAK_ATTACK_SELECT }>;

async function rollSneakAttack(
  ctx: CharacterTxContext<SneakAttackRow, RollSneakAttackOperation>,
): Promise<SneakAttackRollResult> {
  const { tx, row, op, characterId, batchId, sessionId } = ctx;

  const spec = sneakAttackSpecForEntries(row.classEntries);
  if (!spec) {
    throw new InvalidSneakAttackOperationError("Only a rogue (level 1+) has Sneak Attack");
  }
  if (!canApplySneakAttack({ eligible: op.eligible, usedThisTurn: op.usedThisTurn })) {
    throw new InvalidSneakAttackOperationError(
      op.usedThisTurn
        ? "Sneak Attack can only be applied once per turn"
        : "Sneak Attack needs advantage on the attack or an ally adjacent to the target",
    );
  }

  // Server owns the roll: Nd6 summed.
  let roll = 0;
  for (let i = 0; i < spec.count; i += 1) roll += 1 + Math.floor(Math.random() * spec.faces);
  const summary = `Sneak Attack — ${spec.count}d${spec.faces}: ${roll}`;

  await logEvent(tx, {
    characterId,
    category: "roll",
    type: "damageRoll",
    summary,
    data: { source: "Sneak Attack", dice: spec.count, faces: spec.faces, roll },
    batchId,
    sessionId,
  });

  return { roll, dice: spec.count, faces: spec.faces, summary };
}

// Applies a batch of Sneak Attack operations atomically. Mirrors
// applyManeuverOperations: one batchId, state re-read per op. Returns one result
// per op (client folds the roll into the attack's damage tally).
export async function applySneakAttackOperations(
  characterId: string,
  operations: SneakAttackOperation[],
): Promise<SneakAttackRollResult[]> {
  const results: SneakAttackRollResult[] = [];
  await runCharacterTransaction<typeof SNEAK_ATTACK_SELECT, SneakAttackOperation>(characterId, operations, {
    select: SNEAK_ATTACK_SELECT,
    notFound: (id) => new InvalidSneakAttackOperationError(`Character not found: ${id}`),
    applyOp: async (ctx) => {
      results.push(await rollSneakAttack(ctx));
    },
  });
  return results;
}
