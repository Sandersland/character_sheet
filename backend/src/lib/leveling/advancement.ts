/**
 * Advancement transaction handler — Ability Score Improvements and Feats.
 *
 * What is persisted: `advancements` array inside Character.resources JSON,
 * plus the side-effected columns `abilityScores`, `hitPoints`, and
 * `initiativeBonus` (which are updated atomically in the same transaction).
 *
 * What is derived at read time: the total slot count (characterAdvancementSlots
 * in srd/srd.ts) and the clamped display values in serializeCharacter.
 *
 * Design notes:
 *   - Each AdvancementEntry records the exact deltas applied so reversal
 *     subtracts the stored values rather than recomputing from ability scores,
 *     which may have changed since (LIFO undo / reconcile are exact).
 *   - CON increase: +1 max HP per character level applied (hitDice.total).
 *   - DEX increase: initiativeBonus updates by the net change in DEX modifier.
 *   - Undo rides the new `advancement` category in activity.ts, which
 *     restores abilityScores, hitPoints, initiativeBonus, and resources.
 */

import { randomUUID } from "node:crypto";

import { Prisma } from "@/generated/prisma/client.js";
import { runCharacterTransaction } from "@/lib/character/character-transaction.js";
import { levelForExperience, proficiencyBonusForLevel } from "./experience.js";
import { logEvent } from "@/lib/activity/events.js";
import {
  snapshotResources,
  normalizeResourcesMutable,
  serializeResourcesState,
  splitAdvancementsBySlotCap,
  type AdvancementEntry,
  type FeatImprovement,
  type ResourcesMutableState,
} from "@/lib/classes/resources.js";
import { characterAdvancementSlots, abilityModifier, characterFightingStyleFeatSlots, deriveFeatBonuses } from "@/lib/srd/srd.js";
import { featOfferedForAsiSlot, fightingStyleFeatOfferedForClasses, type FeatCategory } from "@/lib/srd/feats.js";
import { effectiveMaxHitPoints, normalizeHitPoints, normalizeHitDice, type HitPoints, type HitDice } from "@/lib/combat/hitpoints.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { draconicResilienceMaxHpTerm } from "@/lib/classes/draconic-bloodline.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection } from "@/lib/rules/catalog-edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

export class InvalidAdvancementOperationError extends Error {}

const ABILITY_NAMES = new Set([
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
]);

export const ABILITY_CAP = 20;
// PHB'24: Epic Boon feats raise an ability score to a maximum of 30, not 20.
const ABILITY_CAP_EPIC_BOON = 30;

/**
 * Computes the effect of applying `abilityDeltas` to `scores`.
 * Returns the new scores and the delta amounts to add to hitPoints.max/current
 * and initiativeBonus. All side-effects on persisted columns derive from here.
 */
function computeAdvancementEffect(
  scores: Record<string, number>,
  hitDiceTotal: number,
  abilityDeltas: Record<string, number>,
): { newScores: Record<string, number>; hpDelta: number; initDelta: number } {
  const newScores = { ...scores };
  for (const [ability, delta] of Object.entries(abilityDeltas)) {
    newScores[ability] = (newScores[ability] ?? 10) + delta;
  }

  // CON: each +1 to CON modifier adds +1 HP per level applied.
  const oldConMod = abilityModifier(scores.constitution ?? 10);
  const newConMod = abilityModifier(newScores.constitution ?? 10);
  const hpDelta = (newConMod - oldConMod) * hitDiceTotal;

  // DEX: each +1 to DEX modifier adds +1 to initiative.
  const oldDexMod = abilityModifier(scores.dexterity ?? 10);
  const newDexMod = abilityModifier(newScores.dexterity ?? 10);
  const initDelta = newDexMod - oldDexMod;

  return { newScores, hpDelta, initDelta };
}

/**
 * Reverses a list of AdvancementEntry values against the current column values,
 * subtracting each entry's stored deltas in LIFO order. Returns the restored
 * column values (does not write anything).
 *
 * Deliberately does NOT clamp `current` — the raw `max` column excludes feat
 * (Tough) and Draconic Resilience (#1123) bonuses, so a legal `current` can sit
 * ABOVE it and a raw-max Math.min here would destroy that headroom (min only
 * lowers; a later effective-max clamp can't restore). Every caller clamps
 * against effectiveMaxHitPoints instead: reconcileAdvancements,
 * applyAdvancementOpInTx's shared tail, and serializeCharacter's own
 * `Math.min(current, effectiveMaxHp)` after applyAdvancementClamp.
 */
export function reverseAdvancementEffects(
  scores: Record<string, number>,
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } },
  initiativeBonus: number,
  entriesToReverse: AdvancementEntry[],
): {
  scores: Record<string, number>;
  hitPoints: { current: number; max: number; temp: number; deathSaves: { successes: number; failures: number } };
  initiativeBonus: number;
} {
  const newScores = { ...scores };
  let newHp = { ...hitPoints, deathSaves: { ...hitPoints.deathSaves } };
  let newInit = initiativeBonus;

  // Apply in reverse order (LIFO).
  for (const entry of [...entriesToReverse].reverse()) {
    for (const [ability, delta] of Object.entries(entry.abilityDeltas)) {
      newScores[ability] = (newScores[ability] ?? 10) - delta;
    }
    newHp = {
      ...newHp,
      max: newHp.max - entry.hpDelta,
      // Exact mirror of the take side (`current: hp.current + hpDelta`),
      // floored at 0 for a low-current character losing a Con-raising entry.
      current: Math.max(0, newHp.current - entry.hpDelta),
    };
    newInit = newInit - entry.initDelta;
  }

  return { scores: newScores, hitPoints: newHp, initiativeBonus: newInit };
}

// fallow-ignore-next-line code-duplication -- advancement operation types intentionally mirror the frontend wire types (types/character/leveling.ts); cross-workspace clone, shared-types consolidation is #820
export interface TakeAsiOperation {
  type: "takeAsi";
  /** One or two increases summing to exactly 2, each capped at 1 or 2. */
  increases: { ability: string; amount: 1 | 2 }[];
}

export interface TakeFeatOperation {
  type: "takeFeat";
  /** Catalog Feat.id — omit for custom feats. */
  featId?: string;
  /** Custom feat payload when featId is absent. */
  custom?: {
    name: string;
    description: string;
    improvements?: FeatImprovement[];
    /**
     * Half-feat style: list of ability names the player may choose to bump.
     * When provided (non-empty), `abilityChoice` must be set at the operation level.
     */
    abilityOptions?: string[];
    /** Amount to increase the chosen ability (default 1). */
    abilityIncrease?: number;
  };
  /** Required when taking a half-feat (catalog or custom) with abilityOptions. */
  abilityChoice?: string;
  /**
   * Fighting Style feat channel (#1137): when "fightingStyle", the feat consumes
   * a fightingStyle slot (its own cap), requires category fighting_style or a
   * custom feat, and dedups against styles already taken. Absent ⇒ ASI slot.
   */
  slot?: "fightingStyle";
}

export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  /** Per-character entry UUID (AdvancementEntry.id). */
  entryId: string;
}

export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

/** Normalized per-op inputs handed to each advancement op handler. */
interface AdvancementOpContext {
  tx: Prisma.TransactionClient;
  scores: Record<string, number>;
  hp: HitPoints;
  hitDice: HitDice;
  initBonus: number;
  /** Mutable — handlers push/splice `state.advancements` in place. */
  state: ResourcesMutableState;
  level: number;
  totalSlots: number;
  /** Fighting Style feat cap across all class entries (#1137). */
  fightingStyleSlotTotal: number;
  /**
   * Names of class entries that grant the Fighting Style feature (#1495) —
   * `class.fightingStyleFeatLevel != null` — fed to
   * fightingStyleFeatOfferedForClasses so a multiclass character's offered
   * set is the union across every style-granting entry, not just the
   * primary. `[]` for a homebrew-only character, which offers unrestricted
   * (empty-classes) rows only under the 2014 branch and everything under 2024.
   */
  fightingStyleClassNames: string[];
  /** This character's edition — gates a client-supplied featId (#1345). */
  edition: RulesEdition;
}

/**
 * What every op handler returns: the audit-event fields plus the new column
 * values the shared tail writes. The handler has already mutated
 * `ctx.state.advancements`; the tail serializes that same state.
 */
interface AdvancementOpOutcome {
  summary: string;
  eventType: "abilityScoreImprovement" | "featTaken" | "advancementRemoved";
  eventData: Record<string, unknown>;
  newScores: Record<string, number>;
  newHp: HitPoints;
  newInitBonus: number;
}

/**
 * Deep-clones the advancement-relevant column state for the audit event's
 * before/after payloads. Undo (revertAdvancementEvent) restores exactly these
 * four keys wholesale — the shape is a compatibility contract with stored events.
 */
function snapshotAdvancementState(
  scores: Record<string, number>,
  hp: HitPoints,
  initBonus: number,
  state: ResourcesMutableState,
) {
  return {
    abilityScores: { ...scores },
    hitPoints: { ...hp, deathSaves: { ...hp.deathSaves } },
    initiativeBonus: initBonus,
    // Full resources snapshot (incl. all advancements) so revert can't wipe it (#818).
    resources: snapshotResources(state),
  };
}

// Gates the correct partition: an ASI/general feat against totalSlots, a Fighting
// Style feat (#1137) against its own fightingStyleSlotTotal. Origin feats occupy
// neither cap (#1130).
function assertSlotAvailable(ctx: AdvancementOpContext, isFightingStyleSlot: boolean): void {
  const { usedSlots, usedFightingStyleSlots } = splitAdvancementsBySlotCap(
    ctx.state.advancements,
    ctx.totalSlots,
    ctx.fightingStyleSlotTotal,
  );
  if (isFightingStyleSlot) {
    if (usedFightingStyleSlots >= ctx.fightingStyleSlotTotal) {
      throw new InvalidAdvancementOperationError(
        `No Fighting Style feat slots available (${usedFightingStyleSlots}/${ctx.fightingStyleSlotTotal} used)`,
      );
    }
  } else if (usedSlots >= ctx.totalSlots) {
    throw new InvalidAdvancementOperationError(
      `No advancement slots available (${usedSlots}/${ctx.totalSlots} used)`,
    );
  }
}

/**
 * Validates a half-feat ability bump (shared by the catalog and custom takeFeat
 * paths) and returns the resulting abilityDeltas — empty when the feat has no
 * abilityOptions. The missing-choice message is the only wording difference
 * between the two paths, so the caller supplies it.
 */
function resolveHalfFeatBump(args: {
  featName: string;
  abilityOptions: string[];
  abilityIncrease: number;
  abilityChoice: string | undefined;
  scores: Record<string, number>;
  missingChoiceMessage: string;
  /** Score ceiling — 20 for General/custom half-feats, 30 for Epic Boons (PHB'24). */
  cap?: number;
}): Record<string, number> {
  const { featName, abilityOptions, abilityIncrease, abilityChoice, scores, missingChoiceMessage } = args;
  const cap = args.cap ?? ABILITY_CAP;
  const abilityDeltas: Record<string, number> = {};
  if (abilityOptions.length === 0) return abilityDeltas;

  if (!abilityChoice) {
    throw new InvalidAdvancementOperationError(missingChoiceMessage);
  }
  if (!abilityOptions.includes(abilityChoice)) {
    throw new InvalidAdvancementOperationError(
      `takeFeat: "${abilityChoice}" is not a valid choice for "${featName}" (options: ${abilityOptions.join(", ")})`,
    );
  }
  const current = scores[abilityChoice] ?? 10;
  if (current + abilityIncrease > cap) {
    throw new InvalidAdvancementOperationError(
      `takeFeat: ${abilityChoice} would exceed ${cap} with +${abilityIncrease}`,
    );
  }
  abilityDeltas[abilityChoice] = abilityIncrease;
  return abilityDeltas;
}

/** Validates a takeAsi op's increases (count, sum, ability names, per-ability cap). */
// fallow-ignore-next-line complexity -- pre-existing guard-clause validator, untouched by and out of scope for #1495
function validateAsiIncreases(op: TakeAsiOperation, scores: Record<string, number>): void {
  if (!op.increases || op.increases.length === 0 || op.increases.length > 2) {
    throw new InvalidAdvancementOperationError(
      "takeAsi: provide 1 or 2 increases",
    );
  }
  const totalPoints = op.increases.reduce((s, inc) => s + inc.amount, 0);
  if (totalPoints !== 2) {
    throw new InvalidAdvancementOperationError(
      `takeAsi: increases must sum to exactly 2 (got ${totalPoints})`,
    );
  }
  for (const { ability, amount } of op.increases) {
    if (!ABILITY_NAMES.has(ability)) {
      throw new InvalidAdvancementOperationError(
        `takeAsi: unknown ability "${ability}"`,
      );
    }
    if (amount !== 1 && amount !== 2) {
      throw new InvalidAdvancementOperationError(
        `takeAsi: amount must be 1 or 2, got ${amount}`,
      );
    }
    const current = scores[ability] ?? 10;
    if (current + amount > ABILITY_CAP) {
      throw new InvalidAdvancementOperationError(
        `takeAsi: ${ability} would exceed ${ABILITY_CAP} (current ${current}, +${amount})`,
      );
    }
  }
}

function applyTakeAsi(ctx: AdvancementOpContext, op: TakeAsiOperation): AdvancementOpOutcome {
  const { scores, hp, hitDice, initBonus, state, level } = ctx;

  assertSlotAvailable(ctx, false);
  validateAsiIncreases(op, scores);

  const abilityDeltas: Record<string, number> = {};
  for (const { ability, amount } of op.increases) {
    abilityDeltas[ability] = (abilityDeltas[ability] ?? 0) + amount;
  }

  const { newScores, hpDelta, initDelta } = computeAdvancementEffect(scores, hitDice.total, abilityDeltas);

  const entry: AdvancementEntry = {
    id: randomUUID(),
    level,
    kind: "asi",
    abilityDeltas,
    hpDelta,
    initDelta,
  };
  state.advancements.push(entry);

  const incDesc = op.increases
    .map(({ ability, amount }) => `${ability} +${amount}`)
    .join(", ");
  return {
    summary: `Ability Score Improvement: ${incDesc}`,
    eventType: "abilityScoreImprovement",
    eventData: { entryId: entry.id, abilityDeltas, hpDelta, initDelta },
    newScores,
    newHp: { ...hp, max: hp.max + hpDelta, current: hp.current + hpDelta },
    newInitBonus: initBonus + initDelta,
  };
}

/** The catalog-vs-custom resolution result consumed by applyTakeFeat's shared tail. */
interface ResolvedFeat {
  featName: string;
  featDescription: string;
  featId?: string;
  improvements: FeatImprovement[];
  abilityDeltas: Record<string, number>;
}

// Slot eligibility for a catalog feat (#1137/#1310/#1495): a fightingStyle-slot
// op must be a fighting_style feat offered to one of the character's
// style-granting classes; an ASI-slot op must satisfy featOfferedForAsiSlot at
// `level`. Split out of resolveCatalogFeat so that function's own branching
// stays around the fetch/cross-edition/half-feat-resolution steps, not this
// block's two independent throw-shaped rules.
function assertFeatSlotEligible(
  catalogFeat: { name: string; category: FeatCategory; classes: readonly string[]; levelPrerequisite: number | null },
  isFightingStyleSlot: boolean,
  level: number,
  edition: RulesEdition,
  fightingStyleClassNames: readonly string[],
): void {
  if (isFightingStyleSlot) {
    // The fightingStyle slot (#1137) takes only fighting_style feats — never a
    // General/Origin/Epic Boon feat routed through it.
    if (catalogFeat.category !== "fighting_style") {
      throw new InvalidAdvancementOperationError(
        `takeFeat: "${catalogFeat.name}" (${catalogFeat.category}) is not a Fighting Style feat`,
      );
    }
    // Hard enforcement (#1495): PHB'14's per-class subset applies at the write
    // path too, not just the GET /api/feats?classes= picker filter — a client
    // can't originate the rule, so a non-conforming pick 400s here even if the
    // caller bypassed the query param entirely.
    if (!fightingStyleFeatOfferedForClasses(catalogFeat, fightingStyleClassNames, edition)) {
      throw new InvalidAdvancementOperationError(
        `takeFeat: "${catalogFeat.name}" is not an offered Fighting Style for ${fightingStyleClassNames.join("/") || "this character"}`,
      );
    }
    return;
  }
  // Edition-invariant (#1310): only General/Epic Boon feats the character's
  // level satisfies may be taken via an ASI slot — Origin (backgrounds) and
  // Fighting Style (class) can't, in either edition.
  if (!featOfferedForAsiSlot(catalogFeat, level)) {
    throw new InvalidAdvancementOperationError(
      `takeFeat: "${catalogFeat.name}" (${catalogFeat.category}) is not available at level ${level}`,
    );
  }
}

async function resolveCatalogFeat(
  tx: Prisma.TransactionClient,
  op: TakeFeatOperation,
  scores: Record<string, number>,
  level: number,
  isFightingStyleSlot: boolean,
  edition: RulesEdition,
  fightingStyleClassNames: readonly string[],
): Promise<ResolvedFeat> {
  const catalogFeat = await tx.feat.findUnique({ where: { id: op.featId } });
  if (!catalogFeat) {
    throw new InvalidAdvancementOperationError(
      `Feat not found in catalog: ${op.featId}`,
    );
  }
  // Before the category/level gates below: a cross-edition row should report
  // its edition mismatch, not whichever gate it also happens to trip (#1345).
  // This snapshot is baked verbatim into AdvancementEntry (below) and never
  // re-validated, so this is prevention, not just admission — the only
  // defense against a wrong-edition rule getting permanently persisted.
  const mismatch = crossEditionRejection(catalogFeat, `Feat "${catalogFeat.name}"`, edition);
  if (mismatch) throw new InvalidAdvancementOperationError(`takeFeat: ${mismatch}`);
  const category = catalogFeat.category as FeatCategory;
  assertFeatSlotEligible(
    { name: catalogFeat.name, category, classes: catalogFeat.classes, levelPrerequisite: catalogFeat.levelPrerequisite },
    isFightingStyleSlot,
    level,
    edition,
    fightingStyleClassNames,
  );
  return {
    featName: catalogFeat.name,
    featDescription: catalogFeat.description,
    featId: catalogFeat.id,
    // Snapshot the catalog's improvements so removal/derivation never
    // depend on the catalog row being present or unchanged.
    improvements: (catalogFeat.improvements as unknown as FeatImprovement[]) ?? [],
    abilityDeltas: resolveHalfFeatBump({
      featName: catalogFeat.name,
      abilityOptions: catalogFeat.abilityOptions,
      abilityIncrease: catalogFeat.abilityIncrease,
      abilityChoice: op.abilityChoice,
      scores,
      cap: category === "epic_boon" ? ABILITY_CAP_EPIC_BOON : ABILITY_CAP,
      missingChoiceMessage: `takeFeat: "${catalogFeat.name}" is a half-feat — provide abilityChoice from: ${catalogFeat.abilityOptions.join(", ")}`,
    }),
  };
}

function resolveCustomFeat(op: TakeFeatOperation, scores: Record<string, number>): ResolvedFeat {
  const c = op.custom!;
  if (!c.name?.trim()) {
    throw new InvalidAdvancementOperationError("takeFeat: custom feat name is required");
  }
  const featName = c.name.trim();
  return {
    featName,
    featDescription: c.description ?? "",
    // Custom feats may supply structured improvements directly.
    improvements: c.improvements ?? [],
    // Custom half-feat: optional ability bump, same rules as catalog half-feats.
    abilityDeltas: resolveHalfFeatBump({
      featName,
      abilityOptions: c.abilityOptions ?? [],
      abilityIncrease: c.abilityIncrease ?? 1,
      abilityChoice: op.abilityChoice,
      scores,
      missingChoiceMessage: `takeFeat: custom feat "${featName}" has abilityOptions — provide abilityChoice from: ${(c.abilityOptions ?? []).join(", ")}`,
    }),
  };
}

async function applyTakeFeat(ctx: AdvancementOpContext, op: TakeFeatOperation): Promise<AdvancementOpOutcome> {
  const { tx, scores, hp, hitDice, initBonus, state, level } = ctx;
  const isFightingStyleSlot = op.slot === "fightingStyle";

  assertSlotAvailable(ctx, isFightingStyleSlot);

  // Exactly one of featId or custom.
  if (Boolean(op.featId) === Boolean(op.custom)) {
    throw new InvalidAdvancementOperationError(
      "takeFeat: provide exactly one of featId or custom",
    );
  }

  const { featName, featDescription, featId: resolvedFeatId, improvements: featImprovements, abilityDeltas } =
    op.featId
      ? await resolveCatalogFeat(tx, op, scores, level, isFightingStyleSlot, ctx.edition, ctx.fightingStyleClassNames)
      : resolveCustomFeat(op, scores);

  // A character can't hold the same Fighting Style twice (#1137) — dedup by
  // catalog id, else by snapshot name (custom / migrated styles carry no featId).
  if (isFightingStyleSlot) {
    const duplicate = state.advancements.some(
      (a) =>
        a.slot === "fightingStyle" &&
        ((resolvedFeatId != null && a.featId === resolvedFeatId) || a.featName === featName),
    );
    if (duplicate) {
      throw new InvalidAdvancementOperationError(`takeFeat: Fighting Style "${featName}" already taken`);
    }
  }

  const { newScores, hpDelta, initDelta } = computeAdvancementEffect(scores, hitDice.total, abilityDeltas);

  const entry: AdvancementEntry = {
    id: randomUUID(),
    level,
    kind: "feat",
    ...(isFightingStyleSlot ? { slot: "fightingStyle" as const } : {}),
    abilityDeltas,
    hpDelta,
    initDelta,
    featId: resolvedFeatId,
    featName,
    featDescription,
    improvements: featImprovements,
  };
  state.advancements.push(entry);

  const abilityBumpDesc = Object.entries(abilityDeltas).length > 0
    ? ` (+${Object.values(abilityDeltas)[0]} ${Object.keys(abilityDeltas)[0]})`
    : "";
  return {
    summary: `Feat: ${featName}${abilityBumpDesc}`,
    eventType: "featTaken",
    eventData: {
      entryId: entry.id,
      featName,
      featId: resolvedFeatId ?? null,
      abilityDeltas,
      hpDelta,
      initDelta,
    },
    newScores,
    newHp: { ...hp, max: hp.max + hpDelta, current: hp.current + hpDelta },
    newInitBonus: initBonus + initDelta,
  };
}

function applyRemoveAdvancement(ctx: AdvancementOpContext, op: RemoveAdvancementOperation): AdvancementOpOutcome {
  const { scores, hp, initBonus, state } = ctx;

  const idx = state.advancements.findIndex((a) => a.id === op.entryId);
  if (idx === -1) {
    throw new InvalidAdvancementOperationError(
      `Advancement entry not found: ${op.entryId}`,
    );
  }

  const removed = state.advancements[idx];

  // Origin feats are background grants, not player-taken advancements (#1130) —
  // they're removed by changing the background at creation, never via this route.
  if (removed.origin) {
    throw new InvalidAdvancementOperationError(
      `Cannot remove an Origin feat (${removed.featName ?? "background grant"})`,
    );
  }

  // Reverse the single entry's effects on scores, HP, and initiative.
  const reversed = reverseAdvancementEffects(scores, hp, initBonus, [removed]);

  state.advancements.splice(idx, 1);

  const label = removed.kind === "feat"
    ? `Feat: ${removed.featName ?? "Custom"}`
    : `ASI: ${Object.entries(removed.abilityDeltas).map(([a, d]) => `${a} +${d}`).join(", ")}`;
  return {
    summary: `Removed advancement: ${label}`,
    eventType: "advancementRemoved",
    eventData: { entryId: op.entryId, label },
    newScores: reversed.scores,
    newHp: reversed.hitPoints,
    newInitBonus: reversed.initiativeBonus,
  };
}

function dispatchAdvancementOp(
  ctx: AdvancementOpContext,
  op: AdvancementOperation,
): AdvancementOpOutcome | Promise<AdvancementOpOutcome> {
  switch (op.type) {
    case "takeAsi": return applyTakeAsi(ctx, op);
    case "takeFeat": return applyTakeFeat(ctx, op);
    case "removeAdvancement": return applyRemoveAdvancement(ctx, op);
    default: {
      const _exhaustive: never = op;
      throw new InvalidAdvancementOperationError(`Unknown op type: ${(_exhaustive as { type: string }).type}`);
    }
  }
}

// Columns/relations applyAdvancementOpInTx re-reads per op; the batch wrapper's
// scaffold row is an existence-only { id: true } check.
const ADVANCEMENT_SELECT = {
  resources: true,
  abilityScores: true,
  hitPoints: true,
  hitDice: true,
  initiativeBonus: true,
  experiencePoints: true,
  rulesEdition: true,
  // conditions (#1321): effectiveMaxHitPoints' exhaustion input for the
  // shared-tail HP clamp in applyAdvancementOpInTx.
  conditions: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    // All entries (name + level) — both the fs-slot cap (#1137) and the ASI/feat
    // slot cap (#1073) sum entitlement per class entry, not just the primary.
    // `class` (#1529): a seventh reconciler/clamp-on-read query site beyond the
    // issue's own enumerated six — found via the signature change + typecheck,
    // resolving the SAME extraAsiLevels/fightingStyleFeatLevel columns.
    // subclass/subclassRef.slug/class.subclassLevel (#1123):
    // draconicResilienceMaxHpTerm's identity inputs for the shared-tail clamp.
    select: {
      name: true,
      level: true,
      subclass: true,
      subclassRef: { select: { slug: true } },
      class: { select: { extraAsiLevels: true, fightingStyleFeatLevel: true, subclassLevel: true } },
    },
  },
} satisfies Prisma.CharacterSelect;

/**
 * Applies one advancement op inside a caller-supplied transaction/batchId, so the
 * unified level-up endpoint (#885) can compose advancement with other domains
 * under one batchId. Reads fresh state via `tx` on every call — a batch of 2 ASIs
 * must see each other's results — then dispatches → writes back → logs its own
 * event (same phases as the wrapper's applyOp, now the single copy of the logic).
 */
export async function applyAdvancementOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: AdvancementOperation,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const character = await tx.character.findUnique({
    where: { id: characterId },
    select: ADVANCEMENT_SELECT,
  });
  if (!character) {
    throw new InvalidAdvancementOperationError(`Character not found: ${characterId}`);
  }

  const level = levelForExperience(character.experiencePoints);
  proficiencyBonusForLevel(level); // validate level is reachable (side-effect-free)

  const ctx: AdvancementOpContext = {
    tx,
    scores: character.abilityScores as Record<string, number>,
    hp: normalizeHitPoints(character.hitPoints),
    hitDice: normalizeHitDice(character.hitDice),
    initBonus: character.initiativeBonus,
    state: normalizeResourcesMutable(character.resources),
    level,
    totalSlots: characterAdvancementSlots(character.classEntries, level),
    fightingStyleSlotTotal: characterFightingStyleFeatSlots(character.classEntries, level),
    // #1495: only entries that actually grant the Fighting Style feature feed
    // the class-scope union — a non-granting multiclass entry (e.g. a Wizard
    // dip) must not widen the offered set.
    fightingStyleClassNames: character.classEntries
      .filter((e) => e.class?.fightingStyleFeatLevel != null)
      .map((e) => e.name),
    edition: editionOf(character),
  };

  const before = snapshotAdvancementState(ctx.scores, ctx.hp, ctx.initBonus, ctx.state);
  const outcome = await dispatchAdvancementOp(ctx, op);

  // #1321: one shared-tail clamp covers takeAsi/takeFeat (which raise max+current
  // by the same hpDelta — at exhaustion 4+ the effective max grows by LESS) and
  // removeAdvancement (which lowers max — reverseAdvancementEffects subtracts
  // exact deltas without clamping, so this is the ONLY clamp on that path).
  // ctx.state.advancements already
  // reflects the op's push/splice, so the feat-slot-cap dance below sees the
  // POST-op advancement list — a just-taken Tough immediately counts.
  const { kept: inCapForHpClamp } = splitAdvancementsBySlotCap(ctx.state.advancements, ctx.totalSlots, ctx.fightingStyleSlotTotal);
  // #1123: the Draconic Resilience term joins the feat bonus via the ONE
  // shared function, matching serializeCharacter's applyFeatLayer composition.
  const maxHpBonusForClamp =
    deriveFeatBonuses(inCapForHpClamp, ctx.hitDice.total).maxHp +
    draconicResilienceMaxHpTerm(character.classEntries, ctx.level, ctx.edition);
  const exhaustionLevel = normalizeConditionsMutable(character.conditions).exhaustion;
  const newEffMax = effectiveMaxHitPoints(outcome.newHp.max, maxHpBonusForClamp, exhaustionLevel, ctx.edition);
  outcome.newHp = { ...outcome.newHp, current: Math.min(outcome.newHp.current, newEffMax) };

  await tx.character.update({
    where: { id: characterId },
    data: {
      abilityScores: outcome.newScores as unknown as Prisma.InputJsonValue,
      hitPoints: outcome.newHp as unknown as Prisma.InputJsonValue,
      initiativeBonus: outcome.newInitBonus,
      resources: serializeResourcesState(ctx.state),
    },
  });

  const after = snapshotAdvancementState(outcome.newScores, outcome.newHp, outcome.newInitBonus, ctx.state);

  await logEvent(tx, {
    characterId,
    category: "advancement",
    type: outcome.eventType,
    summary: outcome.summary,
    before,
    after,
    data: outcome.eventData,
    batchId,
    sessionId,
  });
}

/**
 * Applies a batch of advancement operations atomically in one Prisma transaction.
 * Mirrors applyResourceOperations / applySpellcastingOperations exactly:
 *   - one batchId per request groups ops on the activity timeline
 *   - any throw rolls back the entire batch
 *   - CharacterEvent logged per op with before/after snapshot for undo symmetry
 *
 * The scaffold's per-op row is only the existence check: applyAdvancementOpInTx
 * re-reads its own state via ADVANCEMENT_SELECT so it composes under a caller tx.
 */
export async function applyAdvancementOperations(
  characterId: string,
  operations: AdvancementOperation[],
): Promise<void> {
  await runCharacterTransaction(characterId, operations, {
    select: { id: true },
    notFound: (id) => new InvalidAdvancementOperationError(`Character not found: ${id}`),
    applyOp: ({ tx, op, characterId: id, batchId, sessionId }) =>
      applyAdvancementOpInTx(tx, id, op, batchId, sessionId),
  });
}
