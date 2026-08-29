// The submission schema reuses each domain's existing op schema verbatim, so the wire contract never drifts from the domains it composes.
import { levelUpTargetSchema, type LevelUpTarget } from "@character-sheet/contracts";
import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "@/lib/core/prisma.js";
import { applyLevelUpTransaction, resolveLevelUpContext } from "@/lib/leveling/level-up-transaction.js";
import { grantedSpellsGained, type GrantedSpellSource } from "@/lib/spellcasting/granted-spells.js";
import { casterModelFor } from "@/lib/srd/spellcasting-tables.js";
import { InvalidLevelUpError, resolveLevelUpPlan } from "@/lib/leveling/level-up-submission.js";
import { InvalidHitPointOperationError } from "@/lib/combat/hitpoints.js";
import { InvalidAdvancementOperationError } from "@/lib/leveling/advancement.js";
import { InvalidClassOperationError } from "@/lib/classes/class.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { InvalidSpellcastingOperationError } from "@/lib/spellcasting/spellcasting.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";
import { takeAsiOpSchema, takeFeatOpSchema } from "@/routes/character/advancement.js";
import {
  forgetManeuverOpSchema,
  forgetSubclassChoiceOpSchema,
  learnExpertiseOpSchema,
  learnManeuverOpSchema,
  learnToolProficiencyOpSchema,
  learnSubclassChoiceOpSchema,
} from "@/routes/character/resources.js";
import { forgetSpellOpSchema, learnSpellOpSchema } from "@/routes/character/spellcasting.js";

export const levelUpRouter = Router({ mergeParams: true });

const planQuerySchema = z
  .object({
    classEntryId: z.string().min(1).optional(),
    classId: z.string().min(1).optional(),
    subclassId: z.string().min(1).optional(),
  })
  .refine((q) => !(q.classEntryId && q.classId), {
    message: "classEntryId and classId are mutually exclusive",
  });

// Loaded only on the read-only plan route so the shared level-up commit query never fetches (and discards) these catalog rows.
const GRANT_SOURCE_INCLUDE = { grantedSpells: { orderBy: { gateLevel: "asc" as const }, include: { spell: true } } };

async function persistedGrantSource(target: LevelUpTarget): Promise<GrantedSpellSource | null> {
  if (target.kind !== "existing") return null;
  const entry = await prisma.characterClassEntry.findUnique({
    where: { id: target.classEntryId },
    select: { subclassRef: { include: GRANT_SOURCE_INCLUDE } },
  });
  return entry?.subclassRef ?? null;
}

// Unguarded by design: the handler below awaits resolveLevelUpContext first, and that rejects a cross-edition ?subclassId= — so this lookup is only ever reached with an id the character's edition already admits.
async function pickedGrantSource(subclassId: string | undefined): Promise<GrantedSpellSource | null> {
  if (!subclassId) return null;
  return prisma.subclass.findUnique({ where: { id: subclassId }, select: { name: true, ...GRANT_SOURCE_INCLUDE } });
}

async function resolvePlanTarget(
  characterId: string,
  query: z.infer<typeof planQuerySchema>,
): Promise<LevelUpTarget> {
  if (query.classEntryId) return { kind: "existing", classEntryId: query.classEntryId };
  if (query.classId) return { kind: "new", classId: query.classId };
  const primary = await prisma.characterClassEntry.findFirst({
    where: { characterId },
    orderBy: { position: "asc" },
    select: { id: true },
  });
  if (!primary) throw new InvalidLevelUpError("Character has no class entries");
  return { kind: "existing", classEntryId: primary.id };
}

/**
 * GET /api/characters/:id/level-up/plan (#886)
 * Query: classEntryId XOR classId (default: the primary entry); optional subclassId re-plans for a not-yet-committed subclass pick. Read-only.
 */
levelUpRouter.get<{ id: string }>("/plan", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "view");

  const parsed = planQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid query", details: parsed.error.flatten() });
    return;
  }

  try {
    const target = await resolvePlanTarget(req.params.id, parsed.data);
    const context = await resolveLevelUpContext(req.params.id, target, parsed.data.subclassId);
    // context.pickedSubclassFeatureRows carries the not-yet-committed pick's own rows through the re-plan splice.
    const steps = resolveLevelUpPlan(
      context.planCharacter,
      context.targetEntry,
      context.chosenSubclassName,
      context.pickedSubclassFeatureRows,
      context.chosenSubclassCasterRef,
    );
    const persisted = await persistedGrantSource(target);
    const picked = await pickedGrantSource(parsed.data.subclassId);
    const gained = grantedSpellsGained(
      persisted,
      context.targetEntry.newLevel - 1,
      picked ?? persisted,
      context.targetEntry.newLevel,
      context.planCharacter.edition,
    );
    const targetSubclass = context.chosenSubclassName ?? context.targetEntry.subclass ?? null;
    // Same persisted/picked precedence as targetSubclass above — the not-yet-committed pick's own third-caster identity wins when this same level-up sets a new subclass.
    const targetSubclassCasterRef = context.chosenSubclassCasterRef ?? context.targetEntry.subclassCasterRef ?? null;
    res.json({
      target: {
        className: context.targetEntry.name,
        subclass: targetSubclass,
        newLevel: context.targetEntry.newLevel,
        isPrimary: context.targetIsPrimary,
        // Served so the Review step's granted-spells footnote can render the right noun without re-deriving the rule — null for a non-caster target.
        casterModel: casterModelFor(context.targetEntry.name, targetSubclassCasterRef, context.planCharacter.edition),
      },
      steps,
      grantedSpells: gained.map((s) => ({ name: s.name, level: s.level, school: s.school })),
    });
  } catch (error) {
    if (error instanceof InvalidLevelUpError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }
});

// z.infer of this schema must satisfy LevelUpSubmission — each field reuses the exact op schema its domain already validates.
const levelUpSubmissionSchema = z.object({
  target: levelUpTargetSchema,
  hp: z.object({ method: z.enum(["average", "roll"]), roll: z.number().int().min(1).optional() }),
  advancement: z.discriminatedUnion("type", [takeAsiOpSchema, takeFeatOpSchema]).optional(),
  subclassId: z.string().min(1).optional(),
  fightingStyleFeat: takeFeatOpSchema.optional(),
  maneuvers: z.array(learnManeuverOpSchema).optional(),
  // A maneuver swap (learn-time only) — validated against its step's meta.canSwap by
  // assertManeuverForgets.
  maneuversForgotten: z.array(forgetManeuverOpSchema).optional(),
  toolProficiencies: z.array(learnToolProficiencyOpSchema).optional(),
  expertise: z.array(learnExpertiseOpSchema).optional(),
  subclassChoices: z.array(learnSubclassChoiceOpSchema).optional(),
  // A choose-N swap (e.g. Way of the Four Elements) — validated against its step's
  // meta.canSwap by assertSubclassChoiceForgets.
  subclassChoicesForgotten: z.array(forgetSubclassChoiceOpSchema).optional(),
  spellsLearned: z.array(learnSpellOpSchema).optional(),
  cantripsLearned: z.array(learnSpellOpSchema).optional(),
  spellsForgotten: z.array(forgetSpellOpSchema).optional(),
});

/**
 * POST /api/characters/:id/level-up/transactions
 * Validates the submission against the character's derived plan, then applies every choice under one batchId; any invalid op rolls back the whole ceremony.
 */
makeTransactionsEndpoint({
  router: levelUpRouter,
  schema: levelUpSubmissionSchema,
  apply: (characterId, data, userId) => applyLevelUpTransaction(characterId, data, userId),
  domainErrors: [
    InvalidLevelUpError,
    InvalidHitPointOperationError,
    InvalidAdvancementOperationError,
    InvalidClassOperationError,
    InvalidResourceOperationError,
    InvalidSpellcastingOperationError,
  ],
});
