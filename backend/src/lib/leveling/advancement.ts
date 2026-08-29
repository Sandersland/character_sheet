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
import { characterAdvancementSlots, abilityModifier, characterFightingStyleFeatSlots, fightingStyleGrantingClassNames, deriveFeatBonuses } from "@/lib/srd/srd.js";
import { featOfferedForAsiSlot, fightingStyleFeatOfferedForClasses, type FeatCategory } from "@/lib/srd/feats.js";
import { effectiveMaxHitPoints, normalizeHitPoints, normalizeHitDice, type HitPoints, type HitDice } from "@/lib/combat/hitpoints.js";
import { normalizeConditionsMutable } from "@/lib/combat/conditions.js";
import { draconicResilienceMaxHpTerm } from "@/lib/classes/draconic-bloodline.js";
import { editionOf } from "@/lib/rules/edition.js";
import { crossEditionRejection, resolveEditionRow } from "@/lib/rules/catalog-edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

export class InvalidAdvancementOperationError extends Error {}

const ABILITY_NAMES = new Set([
  "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma",
]);

export const ABILITY_CAP = 20;
// PHB'24: Epic Boon feats raise an ability score to a maximum of 30, not 20.
const ABILITY_CAP_EPIC_BOON = 30;

function computeAdvancementEffect(
  scores: Record<string, number>,
  hitDiceTotal: number,
  abilityDeltas: Record<string, number>,
): { newScores: Record<string, number>; hpDelta: number; initDelta: number } {
  const newScores = { ...scores };
  for (const [ability, delta] of Object.entries(abilityDeltas)) {
    newScores[ability] = (newScores[ability] ?? 10) + delta;
  }

  const oldConMod = abilityModifier(scores.constitution ?? 10);
  const newConMod = abilityModifier(newScores.constitution ?? 10);
  const hpDelta = (newConMod - oldConMod) * hitDiceTotal;

  const oldDexMod = abilityModifier(scores.dexterity ?? 10);
  const newDexMod = abilityModifier(newScores.dexterity ?? 10);
  const initDelta = newDexMod - oldDexMod;

  return { newScores, hpDelta, initDelta };
}

// Deliberately doesn't clamp `current` — callers clamp via effectiveMaxHitPoints instead (reconcileAdvancements, applyAdvancementOpInTx, serializeCharacter).
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

  for (const entry of [...entriesToReverse].reverse()) {
    for (const [ability, delta] of Object.entries(entry.abilityDeltas)) {
      newScores[ability] = (newScores[ability] ?? 10) - delta;
    }
    newHp = {
      ...newHp,
      max: newHp.max - entry.hpDelta,
      // Mirrors the take side (hp.current + hpDelta), floored at 0 for a low-current character losing a Con-raising entry.
      current: Math.max(0, newHp.current - entry.hpDelta),
    };
    newInit = newInit - entry.initDelta;
  }

  return { scores: newScores, hitPoints: newHp, initiativeBonus: newInit };
}

// fallow-ignore-next-line code-duplication -- advancement operation types intentionally mirror the frontend wire types (types/character/leveling.ts); cross-workspace clone, shared-types consolidation is #820
export interface TakeAsiOperation {
  type: "takeAsi";
  increases: { ability: string; amount: 1 | 2 }[];
}

export interface TakeFeatOperation {
  type: "takeFeat";
  featId?: string;
  custom?: {
    name: string;
    description: string;
    improvements?: FeatImprovement[];
    // Non-empty abilityOptions requires `abilityChoice` at the operation level.
    abilityOptions?: string[];
    // Defaults to 1 if omitted.
    abilityIncrease?: number;
  };
  abilityChoice?: string;
  // #1137: "fightingStyle" consumes its own slot cap (not the ASI slot) and dedups against styles already taken; absent means ASI slot.
  slot?: "fightingStyle";
}

export interface RemoveAdvancementOperation {
  type: "removeAdvancement";
  entryId: string;
}

export type AdvancementOperation =
  | TakeAsiOperation
  | TakeFeatOperation
  | RemoveAdvancementOperation;

interface AdvancementOpContext {
  tx: Prisma.TransactionClient;
  scores: Record<string, number>;
  hp: HitPoints;
  hitDice: HitDice;
  initBonus: number;
  // Mutable — handlers push/splice `state.advancements` in place.
  state: ResourcesMutableState;
  level: number;
  totalSlots: number;
  // Fighting Style feat cap across all class entries (#1137).
  fightingStyleSlotTotal: number;
  // #1495: names of class entries that have earned Fighting Style, fed to fightingStyleFeatOfferedForClasses; union across a multiclass, `[]` for homebrew-only.
  fightingStyleClassNames: string[];
  // This character's edition — gates a client-supplied featId (#1345).
  edition: RulesEdition;
}

// Handlers already mutate `ctx.state.advancements` in place; the shared tail serializes that same state.
interface AdvancementOpOutcome {
  summary: string;
  eventType: "abilityScoreImprovement" | "featTaken" | "advancementRemoved";
  eventData: Record<string, unknown>;
  newScores: Record<string, number>;
  newHp: HitPoints;
  newInitBonus: number;
}

// Shape is a compatibility contract: revertAdvancementEvent restores exactly these four keys from stored events.
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

// Gates the correct partition: ASI/general feats against totalSlots, Fighting Style feats (#1137) against fightingStyleSlotTotal; Origin feats (#1130) occupy neither cap.
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

function resolveHalfFeatBump(args: {
  featName: string;
  abilityOptions: string[];
  abilityIncrease: number;
  abilityChoice: string | undefined;
  scores: Record<string, number>;
  missingChoiceMessage: string;
  // Score ceiling — 20 for General/custom half-feats, 30 for Epic Boons (PHB'24).
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

interface ResolvedFeat {
  featName: string;
  featDescription: string;
  featId?: string;
  improvements: FeatImprovement[];
  abilityDeltas: Record<string, number>;
}

function assertFeatSlotEligible(
  catalogFeat: { name: string; category: FeatCategory; classes: readonly string[]; levelPrerequisite: number | null },
  isFightingStyleSlot: boolean,
  level: number,
  edition: RulesEdition,
  fightingStyleClassNames: readonly string[],
): void {
  if (isFightingStyleSlot) {
    if (catalogFeat.category !== "fighting_style") {
      throw new InvalidAdvancementOperationError(
        `takeFeat: "${catalogFeat.name}" (${catalogFeat.category}) is not a Fighting Style feat`,
      );
    }
    // #1495: enforced at the write path too, not just the GET /api/feats picker filter — a client can't originate this rule.
    if (!fightingStyleFeatOfferedForClasses(catalogFeat, fightingStyleClassNames, edition)) {
      throw new InvalidAdvancementOperationError(
        `takeFeat: "${catalogFeat.name}" is not an offered Fighting Style for ${fightingStyleClassNames.join("/") || "this character"}`,
      );
    }
    return;
  }
  // #1310: edition-invariant — only General/Epic Boon feats satisfying `level` may use an ASI slot; Origin and Fighting Style can't.
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
  // #1345: checked before the category/level gates so a cross-edition row reports its edition mismatch, not whichever gate it also trips.
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
    // Snapshotted so removal/derivation never depend on the catalog row being present or unchanged.
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

// #1495: a custom feat matching a catalog Fighting Style row must pass the same class gate, or the catalog check could be bypassed by retyping it as custom.
// findMany + resolveEditionRow, not findFirst: the same name can carry both an exact-edition and a shared/other-edition row with different `classes`; resolveEditionRow mirrors GET /api/feats' resolveEditionCatalog.
async function assertCustomFightingStyleNameEligible(
  tx: Prisma.TransactionClient,
  featName: string,
  edition: RulesEdition,
  fightingStyleClassNames: readonly string[],
): Promise<void> {
  const candidates = await tx.feat.findMany({
    where: { category: "fighting_style", name: { equals: featName, mode: "insensitive" } },
  });
  const matching = resolveEditionRow(candidates, edition);
  if (matching && !fightingStyleFeatOfferedForClasses(matching, fightingStyleClassNames, edition)) {
    throw new InvalidAdvancementOperationError(
      `takeFeat: "${featName}" is not an offered Fighting Style for ${fightingStyleClassNames.join("/") || "this character"}`,
    );
  }
}

async function resolveCustomFeat(
  tx: Prisma.TransactionClient,
  op: TakeFeatOperation,
  scores: Record<string, number>,
  isFightingStyleSlot: boolean,
  edition: RulesEdition,
  fightingStyleClassNames: readonly string[],
): Promise<ResolvedFeat> {
  const c = op.custom!;
  if (!c.name?.trim()) {
    throw new InvalidAdvancementOperationError("takeFeat: custom feat name is required");
  }
  const featName = c.name.trim();
  if (isFightingStyleSlot) {
    await assertCustomFightingStyleNameEligible(tx, featName, edition, fightingStyleClassNames);
  }
  return {
    featName,
    featDescription: c.description ?? "",
    improvements: c.improvements ?? [],
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

  if (Boolean(op.featId) === Boolean(op.custom)) {
    throw new InvalidAdvancementOperationError(
      "takeFeat: provide exactly one of featId or custom",
    );
  }

  const { featName, featDescription, featId: resolvedFeatId, improvements: featImprovements, abilityDeltas } =
    op.featId
      ? await resolveCatalogFeat(tx, op, scores, level, isFightingStyleSlot, ctx.edition, ctx.fightingStyleClassNames)
      : await resolveCustomFeat(tx, op, scores, isFightingStyleSlot, ctx.edition, ctx.fightingStyleClassNames);

  // #1137: dedup by catalog id, else by snapshot name (custom/migrated styles carry no featId) — a character can't hold the same style twice.
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

  // #1130: Origin feats are background grants, not player-taken advancements — removed by changing the background, never via this route.
  if (removed.origin) {
    throw new InvalidAdvancementOperationError(
      `Cannot remove an Origin feat (${removed.featName ?? "background grant"})`,
    );
  }

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

// applyAdvancementOpInTx re-reads these columns/relations per op; the batch wrapper's scaffold row is an existence-only { id: true } check.
const ADVANCEMENT_SELECT = {
  resources: true,
  abilityScores: true,
  hitPoints: true,
  hitDice: true,
  initiativeBonus: true,
  experiencePoints: true,
  rulesEdition: true,
  // conditions (#1321): effectiveMaxHitPoints' exhaustion input for the shared-tail HP clamp.
  conditions: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    // name/level (#1137/#1073): fs-slot and ASI/feat-slot caps sum entitlement per class entry, not just the primary.
    // class (#1529): resolves extraAsiLevels/fightingStyleFeatLevel for the reconciler/clamp-on-read.
    // subclass/subclassRef.slug/class.subclassLevel (#1123): draconicResilienceMaxHpTerm's identity inputs for the shared-tail clamp.
    // class.name (#1495): the canonical class name for fightingStyleGrantingClassNames, never the entry's own display name.
    select: {
      name: true,
      level: true,
      subclass: true,
      subclassRef: { select: { slug: true } },
      class: {
        select: { name: true, extraAsiLevels: true, fightingStyleFeatLevel: true, subclassLevel: true },
      },
    },
  },
} satisfies Prisma.CharacterSelect;

// Reads fresh state via `tx` on every call so a batch of multiple ops sees each other's results (composes under the #885 unified level-up endpoint).
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
  const edition = editionOf(character);

  const ctx: AdvancementOpContext = {
    tx,
    scores: character.abilityScores as Record<string, number>,
    hp: normalizeHitPoints(character.hitPoints),
    hitDice: normalizeHitDice(character.hitDice),
    initBonus: character.initiativeBonus,
    state: normalizeResourcesMutable(character.resources),
    level,
    totalSlots: characterAdvancementSlots(character.classEntries, level),
    // #1148: Champion's Additional Fighting Style second slot forks 7 (2024) vs 10 (2014).
    fightingStyleSlotTotal: characterFightingStyleFeatSlots(character.classEntries, level, edition),
    // #1495: only entries that have actually earned Fighting Style (not merely belong to a granting class) feed the offered-style union.
    fightingStyleClassNames: fightingStyleGrantingClassNames(character.classEntries, level, edition),
    edition,
  };

  const before = snapshotAdvancementState(ctx.scores, ctx.hp, ctx.initBonus, ctx.state);
  const outcome = await dispatchAdvancementOp(ctx, op);

  // #1321: one shared-tail clamp covers takeAsi/takeFeat and removeAdvancement — the only clamp on this path; sees the POST-op advancements list.
  const { kept: inCapForHpClamp } = splitAdvancementsBySlotCap(ctx.state.advancements, ctx.totalSlots, ctx.fightingStyleSlotTotal);
  // #1123: joins the Draconic Resilience term via the same shared function as serializeCharacter's applyFeatLayer composition.
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

// Mirrors applyResourceOperations/applySpellcastingOperations: one batchId per request, any throw rolls back the whole batch, CharacterEvent logged per op for undo symmetry.
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
