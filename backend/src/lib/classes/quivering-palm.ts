// Quivering Palm (Open Hand L17) — a two-step feature: SET on an Unarmed
// Strike hit, then later TRIGGER the vibrations to force a Constitution
// save. 2024 (Warrior of the Open Hand, SRD 5.2 / PHB'24 p.90): spend 4
// focus to SET; a Magic action to TRIGGER, forcing a Constitution save
// (focus DC) for 10d12 Force damage, half as much on a success. 2014 (Way of
// the Open Hand, SRD 5.1 / PHB'14 p.79, #1501): spend 3 ki to SET; an action
// to TRIGGER, and the outcome mapping is INVERTED — a failed save drops the
// target to 0 hit points outright, a successful one takes the full 10d10
// necrotic (never halved). Cost forks via quiveringPalmCost/monkPoolKey; the
// damage-outcome fork lives in resolveQuiveringPalmDamage/
// quiveringPalmSummary below.
//
// "Only one creature at a time" + the day-count duration aren't modeled as
// real state — this app has no NPC combatant or calendar/downtime tracker (see
// stunning-strike.ts's header for the same "no NPC combatant" call). The one
// piece that IS really persisted is the active/inactive flag, so it survives a
// reload or a new session: it reuses the activeEffects buff registry as an
// inert marker (modifier 0, target "quiveringPalm" — a key nothing else reads),
// exactly like Rage's "while-active" buff persists across a reload. The day
// countdown itself is narrated — the player/DM track elapsed days.
//
// Roll ownership (mirrors Stunning Strike): the Con save is a flat d20 with no
// modifier — DC is exact, the roll is a deliberate simplification pending an
// NPC stat-block model. The damage (10d12 Force / 10d10 necrotic) is the
// monk's OWN supernatural effect, so — like Second Wind/Lay on Hands/Deflect
// Attacks' redirect — the client rolls it and sends the total; the server
// only decides the outcome from its own save roll. 2014's drop-to-0 outcome
// needs no roll at all (see resolveQuiveringPalmDamage) — there is no target
// combatant to actually zero out, so it is reported text only, same as
// `appliedDamage` on the 2024 path.

import type { RulesEdition } from "@character-sheet/shared-types";
import type { QuiveringPalmOperation, TriggerQuiveringPalmOperation } from "@character-sheet/contracts";

import { Prisma } from "@/generated/prisma/client.js";
import { logEvent } from "@/lib/activity/events.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { editionOf } from "@/lib/rules/edition.js";
import { runCharacterTransaction, type CharacterTxContext } from "@/lib/character/character-transaction.js";
import { appendActiveBuffInTx, clearBuffByKeyInTx, normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { applySpendResourceInTx } from "./resources.js";
import { monkSaveDC, monkPoolKey } from "./monk.js";
import { resolveSubclassSlug, type SubclassSlug } from "./subclass-slug.js";

export class InvalidQuiveringPalmOperationError extends Error {}

export const QUIVERING_PALM_BUFF_KEY = "quiveringPalm";

// Quivering Palm's grant level (#1337): Open Hand monk L17 in BOTH editions
// (SRD 5.2 / PHB'24 p.90, SRD 5.1 / PHB'14 p.79 — see the module header's
// citations) — edition-invariant, so no `edition` parameter. The single
// source for this gate; quiveringPalmRider imports hasQuiveringPalm rather
// than re-declaring the threshold.
export const QUIVERING_PALM_LEVEL = 17;

/** Whether an Open Hand monk entry (its own level, never `character.level`) has Quivering Palm. */
export function hasQuiveringPalm(monkLevel: number): boolean {
  return monkLevel >= QUIVERING_PALM_LEVEL;
}

// Cost by edition (#1501): SRD 5.1 / PHB'14 p.79 spends 3 ki; SRD 5.2 /
// PHB'24 p.90 spends 4 focus. The pool NAME forks through monkPoolKey; only
// the AMOUNT needs its own switch here.
function quiveringPalmCost(edition: RulesEdition): number {
  return edition === "EDITION_2014" ? 3 : 4;
}

export type QuiveringPalmSaveOutcome = "fail" | "success";

export interface SetQuiveringPalmResult {
  active: true;
  daysRemaining: number;
  summary: string;
}

export interface TriggerQuiveringPalmResult {
  dc: number;
  saveRoll: number;
  outcome: QuiveringPalmSaveOutcome;
  rawDamage: number;
  appliedDamage: number;
  summary: string;
}

export type QuiveringPalmResult = SetQuiveringPalmResult | TriggerQuiveringPalmResult;

/**
 * 2024 (SRD 5.2 "half as much"): fail (roll < DC) takes full rolled damage;
 * success halves it, rounded down.
 *
 * 2014 (SRD 5.1, #1501): the outcome mapping is INVERTED, not merely
 * reworded — a FAILED save drops the target to 0 hit points outright
 * (`rawDamage` is irrelevant, `appliedDamage` reads 0); a SUCCESSFUL save
 * takes the full rolled damage (10d10 necrotic), never halved. Transcribed
 * as SRD 5.1 actually states it — do not normalize this to 2024's
 * fail-full/success-half shape.
 */
export function resolveQuiveringPalmDamage(
  roll: number,
  dc: number,
  rawDamage: number,
  edition: RulesEdition,
): { outcome: QuiveringPalmSaveOutcome; appliedDamage: number } {
  const outcome: QuiveringPalmSaveOutcome = roll >= dc ? "success" : "fail";
  if (edition === "EDITION_2014") {
    return { outcome, appliedDamage: outcome === "fail" ? 0 : rawDamage };
  }
  return { outcome, appliedDamage: outcome === "success" ? Math.floor(rawDamage / 2) : rawDamage };
}

// 2014's fail branch narrates a drop-to-0, not a damage number — this app has
// no NPC/target combatant to actually zero out (CLAUDE.md's self-or-announce
// non-negotiable; see this file's own header), so like `appliedDamage` on the
// 2024 path, this is reported text only, never persisted state.
function quiveringPalmSummary(
  dc: number,
  saveRoll: number,
  outcome: QuiveringPalmSaveOutcome,
  appliedDamage: number,
  rawDamage: number,
  edition: RulesEdition,
): string {
  const base = `Quivering Palm — Constitution save DC ${dc}, target rolled ${saveRoll}`;
  if (edition === "EDITION_2014") {
    return outcome === "fail"
      ? `${base}: failed — dropped to 0 hit points.`
      : `${base}: made it — ${appliedDamage} necrotic damage.`;
  }
  return outcome === "fail"
    ? `${base}: failed — ${appliedDamage} Force damage.`
    : `${base}: made it — ${appliedDamage} Force damage (half of ${rawDamage}).`;
}

const QUIVERING_PALM_SELECT = {
  experiencePoints: true,
  abilityScores: true,
  activeEffects: true,
  rulesEdition: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, level: true, subclass: true, subclassRef: { select: { slug: true } } },
  },
} satisfies Prisma.CharacterSelect;

type QuiveringPalmRow = Prisma.CharacterGetPayload<{ select: typeof QUIVERING_PALM_SELECT }>;

function monkEntry(row: QuiveringPalmRow) {
  return row.classEntries.find((c) => c.name.toLowerCase() === "monk");
}

// Both editions' Open Hand subclasses grant this feature — "Warrior of the
// Open Hand" (SRD 5.2, EDITION_2024) and "Way of the Open Hand" (SRD 5.1,
// EDITION_2014, #1501) are SEPARATE subclasses, not one forked across
// editions, so a character can only ever resolve to one of the two slugs.
// Resolved via slug (#1277: FK preferred, exact normalized name as
// fallback). Was substring-matched on the words "open hand" — the same
// failure class #1339 fixed at the DERIVED_ACTIONS gate.
const OPEN_HAND_SLUGS: readonly SubclassSlug[] = ["monk-warrior-of-the-open-hand", "monk-way-of-the-open-hand"];

function isOpenHandFamily(row: QuiveringPalmRow): boolean {
  const monk = monkEntry(row);
  const slug = monk && resolveSubclassSlug("monk", monk);
  return !!slug && OPEN_HAND_SLUGS.includes(slug);
}

/** Throws unless this is a level-17+ Open Hand monk (either edition); returns the monk level. */
function assertQuiveringPalmAvailable(row: QuiveringPalmRow): number {
  const monk = monkEntry(row);
  if (!monk || !hasQuiveringPalm(monk.level) || !isOpenHandFamily(row)) {
    throw new InvalidQuiveringPalmOperationError(
      `Only an Open Hand monk (level ${QUIVERING_PALM_LEVEL}+) has Quivering Palm`,
    );
  }
  return monk.level;
}

async function setQuiveringPalm(
  tx: Prisma.TransactionClient,
  row: QuiveringPalmRow,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<SetQuiveringPalmResult> {
  const monkLevel = assertQuiveringPalmAvailable(row);
  const edition = editionOf(row);

  const activeState = normalizeActiveEffectsMutable(row.activeEffects);
  if (activeState.buffs.some((b) => b.key === QUIVERING_PALM_BUFF_KEY)) {
    throw new InvalidQuiveringPalmOperationError("You can maintain vibrations in only one creature at a time");
  }

  await applySpendResourceInTx(
    tx,
    characterId,
    { type: "spendResource", key: monkPoolKey(edition), amount: quiveringPalmCost(edition) },
    batchId,
    sessionId,
  );
  await appendActiveBuffInTx(
    tx,
    characterId,
    {
      key: QUIVERING_PALM_BUFF_KEY,
      target: QUIVERING_PALM_BUFF_KEY,
      modifier: 0,
      source: "Quivering Palm",
      duration: "while-active",
    },
    batchId,
    sessionId,
  );

  const summary = `Quivering Palm — set imperceptible vibrations (lasts ${monkLevel} days unless triggered or ended).`;
  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "setQuiveringPalm",
    summary,
    data: { daysRemaining: monkLevel },
    batchId,
    sessionId,
  });

  return { active: true, daysRemaining: monkLevel, summary };
}

async function triggerQuiveringPalm(
  tx: Prisma.TransactionClient,
  row: QuiveringPalmRow,
  op: TriggerQuiveringPalmOperation,
  characterId: string,
  batchId: string,
  sessionId: string | null,
): Promise<TriggerQuiveringPalmResult> {
  assertQuiveringPalmAvailable(row);

  const activeState = normalizeActiveEffectsMutable(row.activeEffects);
  if (!activeState.buffs.some((b) => b.key === QUIVERING_PALM_BUFF_KEY)) {
    throw new InvalidQuiveringPalmOperationError("No vibrations are currently set");
  }
  if (!Number.isFinite(op.roll) || op.roll <= 0) {
    throw new InvalidQuiveringPalmOperationError("triggerQuiveringPalm requires a positive damage roll");
  }

  const level = levelForExperience(row.experiencePoints);
  const profBonus = proficiencyBonusForLevel(level);
  const abilityScores = row.abilityScores as Record<string, number>;
  const dc = monkSaveDC(abilityScores, profBonus);
  const edition = editionOf(row);

  const saveRoll = 1 + Math.floor(Math.random() * 20);
  const { outcome, appliedDamage } = resolveQuiveringPalmDamage(saveRoll, dc, op.roll, edition);

  await clearBuffByKeyInTx(tx, characterId, QUIVERING_PALM_BUFF_KEY, batchId, sessionId, "Quivering Palm triggered");

  const summary = quiveringPalmSummary(dc, saveRoll, outcome, appliedDamage, op.roll, edition);

  await logEvent(tx, {
    characterId,
    category: "resources",
    type: "triggerQuiveringPalm",
    summary,
    data: { dc, saveRoll, outcome, rawDamage: op.roll, appliedDamage },
    batchId,
    sessionId,
  });

  return { dc, saveRoll, outcome, rawDamage: op.roll, appliedDamage, summary };
}

/**
 * Applies a batch of Quivering Palm operations atomically. Mirrors
 * applyStunningStrikeOperations: one batchId, state re-read per op.
 */
export async function applyQuiveringPalmOperations(
  characterId: string,
  operations: QuiveringPalmOperation[],
): Promise<QuiveringPalmResult[]> {
  const results: QuiveringPalmResult[] = [];
  await runCharacterTransaction<typeof QUIVERING_PALM_SELECT, QuiveringPalmOperation>(characterId, operations, {
    select: QUIVERING_PALM_SELECT,
    notFound: (id) => new InvalidQuiveringPalmOperationError(`Character not found: ${id}`),
    applyOp: async (ctx: CharacterTxContext<QuiveringPalmRow, QuiveringPalmOperation>) => {
      const { tx, row, op, characterId: id, batchId, sessionId } = ctx;
      if (op.type === "setQuiveringPalm") {
        results.push(await setQuiveringPalm(tx, row, id, batchId, sessionId));
      } else {
        results.push(await triggerQuiveringPalm(tx, row, op, id, batchId, sessionId));
      }
    },
  });
  return results;
}
