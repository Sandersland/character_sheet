// Owns POST /api/characters/:id/level-up/transactions — the unified level-up
// ceremony endpoint (#885). The submission schema REUSES each domain's existing
// op schema verbatim (imported from the per-domain routers) so the wire contract
// never drifts from the domains it composes; applyLevelUpTransaction validates it
// against the derived plan and applies every choice under one batchId.
import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { prisma } from "@/lib/core/prisma.js";
import { applyLevelUpTransaction, resolveLevelUpContext } from "@/lib/leveling/level-up-transaction.js";
import { grantedSpellsGained, type GrantedSpellSource } from "@/lib/spellcasting/granted-spells.js";
import { InvalidLevelUpError, resolveLevelUpPlan } from "@/lib/leveling/level-up-submission.js";
import type { LevelUpTarget } from "@/lib/combat/hp-operations.js";
import { InvalidHitPointOperationError } from "@/lib/combat/hitpoints.js";
import { InvalidAdvancementOperationError } from "@/lib/leveling/advancement.js";
import { InvalidClassOperationError } from "@/lib/classes/class.js";
import { InvalidResourceOperationError } from "@/lib/classes/resources.js";
import { InvalidSpellcastingOperationError } from "@/lib/spellcasting/spellcasting.js";
import { makeTransactionsEndpoint } from "@/lib/http/transactions-endpoint.js";
import { levelUpTargetSchema } from "@/routes/character/hitpoints.js";
import { takeAsiOpSchema, takeFeatOpSchema } from "@/routes/character/advancement.js";
import {
  learnManeuverOpSchema,
  learnDisciplineOpSchema,
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

// #1139: the granted-spell diff needs the target's committed grant source and any
// not-yet-committed ?subclassId= pick. Loaded ONLY on the read-only plan route so
// the shared level-up commit query never fetches (and discards) these catalog rows.
const GRANT_SOURCE_INCLUDE = { grantedSpells: { orderBy: { gateLevel: "asc" as const }, include: { spell: true } } };

async function persistedGrantSource(target: LevelUpTarget): Promise<GrantedSpellSource | null> {
  if (target.kind !== "existing") return null;
  const entry = await prisma.characterClassEntry.findUnique({
    where: { id: target.classEntryId },
    select: { subclassRef: { include: GRANT_SOURCE_INCLUDE } },
  });
  return entry?.subclassRef ?? null;
}

async function pickedGrantSource(subclassId: string | undefined): Promise<GrantedSpellSource | null> {
  if (!subclassId) return null;
  return prisma.subclass.findUnique({ where: { id: subclassId }, select: { name: true, ...GRANT_SOURCE_INCLUDE } });
}

// Neither classEntryId nor classId given → plan the primary (position-0) entry.
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
 * GET /api/characters/:id/level-up/plan
 * The derived ceremony plan (#886): the resolved target — className, effective
 * subclass, newLevel, isPrimary — plus the ordered LevelUpStep list the POST
 * below will validate a submission against. Query: classEntryId XOR classId
 * (default: the primary entry); optional subclassId triggers the re-plan for a
 * not-yet-committed subclass pick. Read-only — nothing is mutated.
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
    const steps = resolveLevelUpPlan(context.planCharacter, context.targetEntry, context.chosenSubclassName);
    const persisted = await persistedGrantSource(target);
    const picked = await pickedGrantSource(parsed.data.subclassId);
    const gained = grantedSpellsGained(
      persisted,
      context.targetEntry.newLevel - 1,
      picked ?? persisted,
      context.targetEntry.newLevel,
    );
    res.json({
      target: {
        className: context.targetEntry.name,
        subclass: context.chosenSubclassName ?? context.targetEntry.subclass ?? null,
        newLevel: context.targetEntry.newLevel,
        isPrimary: context.targetIsPrimary,
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

// z.infer of this schema must satisfy LevelUpSubmission — each field reuses the
// exact op schema its domain already validates, so the parsed body is the domain
// op shape verbatim (only `target`/hp/subclassId are level-up-local; fightingStyleFeat reuses takeFeat).
const levelUpSubmissionSchema = z.object({
  target: levelUpTargetSchema,
  hp: z.object({ method: z.enum(["average", "roll"]), roll: z.number().int().min(1).optional() }),
  advancement: z.discriminatedUnion("type", [takeAsiOpSchema, takeFeatOpSchema]).optional(),
  subclassId: z.string().min(1).optional(),
  fightingStyleFeat: takeFeatOpSchema.optional(),
  maneuvers: z.array(learnManeuverOpSchema).optional(),
  disciplines: z.array(learnDisciplineOpSchema).optional(),
  toolProficiencies: z.array(learnToolProficiencyOpSchema).optional(),
  subclassChoices: z.array(learnSubclassChoiceOpSchema).optional(),
  spellsLearned: z.array(learnSpellOpSchema).optional(),
  cantripsLearned: z.array(learnSpellOpSchema).optional(),
  spellsForgotten: z.array(forgetSpellOpSchema).optional(),
});

/**
 * POST /api/characters/:id/level-up/transactions
 * One atomic level-up: validates the structured submission against the character's
 * derived plan, then applies hit points, advancement (ASI/feat), subclass choice,
 * subclass-derived choices (maneuvers / disciplines / tool proficiency / choose-N),
 * and newly learned spells under a single batchId. Any invalid op rolls back the
 * whole ceremony. Returns the full updated character.
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
