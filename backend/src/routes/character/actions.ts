/**
 * POST /api/characters/:id/actions/transactions
 * Applies ops in one Prisma transaction under a shared batchId (atomic, LIFO-undoable). There is no GET /api/actions endpoint.
 */

import { randomUUID } from "node:crypto";

import { executeActionOpSchema, type ExecuteActionOperation } from "@character-sheet/contracts";
import type { ExecuteActionResult, RulesEdition } from "@character-sheet/shared-types";
import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import { ACTION_EFFECT_FN, castSpecFromRow, endActionKey, toggleRowOps, UnknownActionError } from "@/lib/classes/actions.js";
import { castAbilityInTx } from "@/lib/spellcasting/ability-cast.js";
import { ABILITY_SLOT_SUBJECT, type PayCostContext } from "@/lib/spellcasting/ability-cost.js";
import { castAbilityWithSlotInTx } from "@/lib/spellcasting/spellcasting.js";
import type { SpendResourceOperation } from "@/lib/classes/resources.js";
import type { AdjustQuantityOperation } from "@/lib/inventory/inventory.js";
import { applyAdjustQuantity } from "@/lib/inventory/inventory.js";
import { applyHealInTx, applyTempHpInTx } from "@/lib/combat/hitpoints.js";
import { applySpendResourceInTx } from "@/lib/classes/resources.js";
import { deriveMartialArtsDie } from "@/lib/srd/srd.js";
import { DEFAULT_RULES_EDITION, editionOf } from "@/lib/rules/edition.js";
import { rollDie } from "@/lib/core/dice.js";
import { appendActiveBuffInTx, normalizeActiveEffectsMutable } from "@/lib/combat/active-effects.js";
import { clearBuffByKeyInTx } from "@/lib/combat/buff-end.js";
import { syncConditionImmunityOnBuffStartInTx, type ConditionImmunityBuffRows } from "@/lib/combat/conditions.js";
import { currentArmorStateInTx, unmetActivationRequirements, ActivationRequirementError } from "@/lib/classes/activation-requires.js";
import { normalizeSpellcastingMutable } from "@/lib/spellcasting/spell-state.js";
import { getActiveSessionId } from "@/lib/session/sessions.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";
import { levelForExperience, proficiencyBonusForLevel } from "@/lib/leveling/experience.js";
import { effectiveEntryLevel } from "@/lib/leveling/effective-levels.js";
import { FEATURE_ROWS_ENTRY_SELECT, featureRowsOf } from "@/lib/classes/feature-rows-select.js";
import { effectBuffsFromRow, type ClassFeatureRow, type ResourceTotalContext } from "@/lib/classes/class-feature-rows.js";

export const actionsRouter = Router({ mergeParams: true });

const actionTransactionsSchema = z.object({
  operations: z.array(executeActionOpSchema).min(1),
});

// Shared by assertKnownActionKeys and applyRowDrivenActionInTx so the two can't disagree.
const ROW_ACTION_SELECT = {
  experiencePoints: true,
  rulesEdition: true,
  // Only used by the toggle handler's evaluateBuffModifier ({ abilityMod } tiers).
  abilityScores: true,
  // Fetched unconditionally for the requiresActiveBuff gate — the triggering row isn't known until after this query resolves.
  activeEffects: true,
  classEntries: {
    orderBy: { position: "asc" as const },
    select: { name: true, subclass: true, level: true, ...FEATURE_ROWS_ENTRY_SELECT },
  },
} satisfies Prisma.CharacterSelect;

type RowActionCharacter = Prisma.CharacterGetPayload<{ select: typeof ROW_ACTION_SELECT }>;

// entryLevel is the entry's effective level, not the XP-derived total (differs once multiclassed); actionKey is resourceKey, or endActionKey(...) for a toggle row's synthesized end half.
interface EligibleRowAction {
  row: ClassFeatureRow;
  entryLevel: number;
  actionKey: string;
  isToggleEnd: boolean;
  // Needed by syncConditionImmunityOnBuffStartInTx's Mindless Rage sibling scan.
  carrier: ConditionImmunityBuffRows;
}

// Mirrors deriveEntryScopedActions's per-entry gate and toggleActionsFromRow's two-entry split, so availableActions[] and this dispatcher's legality check can never drift apart.
function eligibleRowActions(character: RowActionCharacter): EligibleRowAction[] {
  const totalLevel = levelForExperience(character.experiencePoints);
  const edition = editionOf(character);
  const rows: EligibleRowAction[] = [];
  for (const entry of character.classEntries) {
    const effLevel = effectiveEntryLevel(entry.level, character.classEntries.length, totalLevel);
    const { classRows, subclassRows } = featureRowsOf(entry);
    const carrier: ConditionImmunityBuffRows = { classRows, subclassRows };
    for (const row of [...classRows, ...subclassRows]) {
      if (!row.activationCost || row.edition !== edition || row.level > effLevel) continue;
      if (row.resolverKind === "toggle") {
        if (!row.resourceKey) continue;
        rows.push({ row, entryLevel: effLevel, actionKey: row.resourceKey, isToggleEnd: false, carrier });
        rows.push({ row, entryLevel: effLevel, actionKey: endActionKey(row.resourceKey), isToggleEnd: true, carrier });
      } else if (row.resourceKey) {
        rows.push({ row, entryLevel: effLevel, actionKey: row.resourceKey, isToggleEnd: false, carrier });
      }
    }
  }
  return rows;
}

async function applyActionOpInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ExecuteActionOperation,
  batchId: string,
  sessionId: string | null,
  heightenedFocusTempHp: number,
  edition: RulesEdition,
): Promise<ExecuteActionResult> {
  const effectFn = ACTION_EFFECT_FN[op.actionKey];
  if (!effectFn) {
    return applyRowDrivenActionInTx(tx, characterId, op, batchId, sessionId);
  }

  const ctx = { roll: op.roll, inventoryItemId: op.inventoryItemId, heightenedFocusTempHp, edition };
  const ops = effectFn(ctx);
  for (const effect of ops) {
    await applyActionEffectInTx(tx, characterId, effect, batchId, sessionId);
  }
  return {};
}

function hasActivationRequires(row: ClassFeatureRow): boolean {
  return Boolean(row.activationRequires && row.activationRequires.length > 0);
}

// Never checked on a toggle row's END half — ending is always legal (mirrors toggleActionsFromRow's own rule).
async function assertActivationRequirementsMet(
  tx: Prisma.TransactionClient,
  characterId: string,
  character: RowActionCharacter,
  row: ClassFeatureRow,
  isToggleEnd: boolean,
): Promise<void> {
  if (isToggleEnd || !hasActivationRequires(row)) return;
  const activeBuffKeys = new Set(normalizeActiveEffectsMutable(character.activeEffects).buffs.map((b) => b.key));
  const armor = await currentArmorStateInTx(tx, characterId);
  const reasons = unmetActivationRequirements(row.activationRequires, { armor, activeBuffKeys });
  if (reasons.length > 0) {
    throw new ActivationRequirementError(`${row.name} ${reasons.join("; ")}`);
  }
}

async function applyRowDrivenActionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  op: ExecuteActionOperation,
  batchId: string,
  sessionId: string | null,
): Promise<ExecuteActionResult> {
  const character = await tx.character.findUnique({ where: { id: characterId }, select: ROW_ACTION_SELECT });
  if (!character) throw new Error(`Character not found: ${characterId}`);

  const eligible = eligibleRowActions(character).find((e) => e.actionKey === op.actionKey);
  if (!eligible) {
    throw new UnknownActionError(`Unknown action key: ${op.actionKey}`);
  }
  const { row, entryLevel, isToggleEnd } = eligible;

  await assertActivationRequirementsMet(tx, characterId, character, row, isToggleEnd);

  if (row.resolverKind === "toggle") {
    await applyToggleRowActionInTx(tx, characterId, character, eligible, batchId, sessionId);
    return {};
  }

  // eligibleRowActions' gate above guarantees resourceKey is defined for every non-toggle row.
  const resourceKey = row.resourceKey as string;

  if (!row.effectKind) {
    // A pure counter (Action Surge) — the extra-action grant is client-side.
    await applySpendResourceInTx(
      tx,
      characterId,
      { type: "spendResource", key: resourceKey },
      batchId,
      sessionId,
    );
    return {};
  }

  const { spec, roll } = castSpecFromRow(row, entryLevel, rollDie);

  if (spec.cost.kind === "slot") {
    await castAbilityWithSlotInTx(tx, characterId, batchId, sessionId, {
      name: spec.name,
      entryId: op.actionKey,
      cost: spec.cost,
      effect: spec.effect,
      requested: op.slotLevel,
      roll,
      eventType: "castAbilitySlot",
      concentrates: false,
      apply: spec.apply,
      costSubject: ABILITY_SLOT_SUBJECT,
    });
    return { roll };
  }

  const cRow = await tx.character.findUnique({ where: { id: characterId }, select: { spellcasting: true } });
  if (!cRow) throw new Error(`Character not found: ${characterId}`);
  const costCtx: PayCostContext = { tx, characterId, batchId, sessionId };
  await castAbilityInTx(
    { tx, characterId, batchId, sessionId, cost: costCtx, concentrationHost: normalizeSpellcastingMutable(cRow.spellcasting) },
    {
      name: spec.name,
      entryId: op.actionKey,
      cost: spec.cost,
      effect: spec.effect,
      roll,
      eventType: "castSpell",
      concentrates: false,
      apply: spec.apply,
    },
  );
  return { roll };
}

// isToggleEnd returns early — clearBuffByKeyInTx already restored any suspended condition, so only START runs the immunity sync.
async function applyToggleRowActionInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  character: RowActionCharacter,
  eligible: EligibleRowAction,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  const { row, entryLevel, isToggleEnd, carrier } = eligible;
  const ctx: ResourceTotalContext = {
    level: entryLevel,
    abilityScores: character.abilityScores as Record<string, number>,
    profBonus: proficiencyBonusForLevel(levelForExperience(character.experiencePoints)),
  };
  for (const effect of toggleRowOps(row, ctx, isToggleEnd)) {
    await applyActionEffectInTx(tx, characterId, effect, batchId, sessionId);
  }
  if (isToggleEnd) return;
  const buffKeys = effectBuffsFromRow(row, ctx).map((b) => b.key);
  await syncConditionImmunityOnBuffStartInTx(tx, characterId, carrier, entryLevel, editionOf(character), buffKeys, batchId, sessionId);
}

type ActionEffect = ReturnType<(typeof ACTION_EFFECT_FN)[string]>[number];

async function applyActionEffectInTx(
  tx: Prisma.TransactionClient,
  characterId: string,
  effect: ActionEffect,
  batchId: string,
  sessionId: string | null,
): Promise<void> {
  switch (effect.type) {
    case "spendResource":
      // Safe: SpendResourceOp is a structural subset of SpendResourceOperation (omits optional roll), which applySpendResourceInTx treats as optional.
      await applySpendResourceInTx(
        tx, characterId, effect as SpendResourceOperation, batchId, sessionId
      );
      break;

    case "adjustQuantity":
      // Structurally identical to AdjustQuantityOperation.
      await applyAdjustQuantity(
        tx, characterId, effect as AdjustQuantityOperation, batchId, sessionId
      );
      break;

    case "heal":
      await applyHealInTx(tx, characterId, effect.amount, batchId, sessionId);
      break;

    case "tempHp":
      await applyTempHpInTx(tx, characterId, effect.amount, batchId, sessionId);
      break;

    case "applyBuff":
      await appendActiveBuffInTx(tx, characterId, effect.buff, batchId, sessionId);
      break;

    case "clearBuff":
      await clearBuffByKeyInTx(tx, characterId, effect.key, batchId, sessionId, effect.reason);
      break;

    default: {
      // Exhaustive — ACTION_EFFECT_FN returns the six op types above.
      const _never: never = effect;
      throw new Error(`Unexpected op type in action effect: ${JSON.stringify(_never)}`);
    }
  }
}

// Reuses eligibleRowActions — the same gate applyRowDrivenActionInTx dispatches through, so a rejected key can never be one the dispatcher would accept.
async function assertKnownActionKeys(operations: ExecuteActionOperation[], characterId: string): Promise<void> {
  const character = await prisma.character.findUnique({ where: { id: characterId }, select: ROW_ACTION_SELECT });
  // actionKey, not row.resourceKey, so a toggle row's synthesized end key is recognized too.
  const rowKeys = new Set((character ? eligibleRowActions(character) : []).map((e) => e.actionKey));
  for (const op of operations) {
    if (!ACTION_EFFECT_FN[op.actionKey] && !rowKeys.has(op.actionKey)) {
      throw new UnknownActionError(`Unknown action key: ${op.actionKey}`);
    }
  }
}

// Heightened Focus, PHB'24 p.98/SRD 5.2: temp HP = two Martial Arts die rolls, rolled server-side.
async function computeHeightenedFocusTempHp(operations: ExecuteActionOperation[], characterId: string): Promise<number> {
  if (!operations.some((op) => op.actionKey === "patientDefenseFocus")) return 0;
  const classRow = await prisma.character.findUnique({
    where: { id: characterId },
    select: { classEntries: { select: { name: true, level: true } }, rulesEdition: true },
  });
  if (!classRow) return 0;
  const monkLevel = classRow.classEntries.find((e) => e.name.toLowerCase() === "monk")?.level ?? 0;
  if (monkLevel < 10) return 0;
  const dieFaces = deriveMartialArtsDie(monkLevel, editionOf(classRow));
  return rollDie(dieFaces) + rollDie(dieFaces);
}

// Falls back to the schema default if the character is missing between this read and the transaction — the transaction itself already guards that case.
async function characterEdition(characterId: string): Promise<RulesEdition> {
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { rulesEdition: true } });
  return row ? editionOf(row) : DEFAULT_RULES_EDITION;
}

actionsRouter.post<{ id: string }>(
  "/transactions",
  async (req, res) => {
    const { id: characterId } = req.params;

    await assertCharacterAccess(prisma, req.user!.id, characterId, "edit");

    const parsed = actionTransactionsSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const { operations } = parsed.data;

    // Every domain error carries an explicit status, so it flows to errorHandler as a 400 (or an unexpected throw as a 500) — no message-string sniffing.
    await assertKnownActionKeys(operations, characterId);

    const heightenedFocusTempHp = await computeHeightenedFocusTempHp(operations, characterId);
    const edition = await characterEdition(characterId);
    const batchId = randomUUID();
    const sessionId = await getActiveSessionId(characterId);

    // results is index-aligned 1:1 with operations (mirrors applyManeuverOperations) so the client can fold a row-driven roll into its dice animation without re-deriving it.
    const results: ExecuteActionResult[] = [];
    await prisma.$transaction(async (tx) => {
      for (const op of operations) {
        results.push(await applyActionOpInTx(tx, characterId, op, batchId, sessionId, heightenedFocusTempHp, edition));
      }
    });

    const row = await prisma.character.findUnique({
      where: { id: characterId },
      include: characterInclude,
    });
    if (!row) {
      res.status(404).json({ error: "Character not found after transaction" });
      return;
    }

    // batchId lets the client revert this exact batch on turn undo.
    res.json({ ...(await serializeCharacter(row)), batchId, results });
  }
);
