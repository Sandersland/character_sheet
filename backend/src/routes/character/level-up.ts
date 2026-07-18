// Owns POST /api/characters/:id/level-up/transactions — the unified level-up
// ceremony endpoint (#885). The submission schema REUSES each domain's existing
// op schema verbatim (imported from the per-domain routers) so the wire contract
// never drifts from the domains it composes; applyLevelUpTransaction validates it
// against the derived plan and applies every choice under one batchId.
import { Router } from "express";
import { z } from "zod";

import { applyLevelUpTransaction } from "@/lib/leveling/level-up-transaction.js";
import { InvalidLevelUpError } from "@/lib/leveling/level-up-submission.js";
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
import { learnSpellOpSchema } from "@/routes/character/spellcasting.js";
import { fightingStyleKeySchema } from "@/routes/character/class.js";

export const levelUpRouter = Router({ mergeParams: true });

// z.infer of this schema must satisfy LevelUpSubmission — each field reuses the
// exact op schema its domain already validates, so the parsed body is the domain
// op shape verbatim (only `target`/hp/subclassId/fightingStyle are level-up-local).
const levelUpSubmissionSchema = z.object({
  target: levelUpTargetSchema,
  hp: z.object({ method: z.enum(["average", "roll"]), roll: z.number().int().min(1).optional() }),
  advancement: z.discriminatedUnion("type", [takeAsiOpSchema, takeFeatOpSchema]).optional(),
  subclassId: z.string().min(1).optional(),
  fightingStyle: fightingStyleKeySchema.optional(),
  maneuvers: z.array(learnManeuverOpSchema).optional(),
  disciplines: z.array(learnDisciplineOpSchema).optional(),
  toolProficiencies: z.array(learnToolProficiencyOpSchema).optional(),
  subclassChoices: z.array(learnSubclassChoiceOpSchema).optional(),
  spellsLearned: z.array(learnSpellOpSchema).optional(),
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
