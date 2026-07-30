import { hitPointOperationSchema } from "@character-sheet/contracts";
import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

export const hitPointsRouter = Router({ mergeParams: true });

const hpRequestSchema = z.object({
  operations: z.array(hitPointOperationSchema).min(1),
});

hitPointsRouter.post<{ id: string }>("/", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = hpRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  // InvalidHitPointOperationError carries status 400, so an invalid op flows to
  // the central `errorHandler` — no route-local try/catch needed.
  const { concentrationChecks } = await applyHitPointOperations(
    req.params.id,
    parseResult.data.operations,
  );

  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  // Response = serialized character plus any concentration check(s) triggered by
  // damage ops (issue #41) so the client can toast the auto-rolled CON save.
  res.json({ ...serializeCharacter(updated!), concentrationChecks });
});
