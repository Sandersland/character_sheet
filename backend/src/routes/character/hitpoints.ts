import { Router } from "express";
import { z } from "zod";

import { assertCharacterAccess } from "@/lib/auth/access.js";
import { applyHitPointOperations } from "@/lib/combat/hitpoints.js";
import { prisma } from "@/lib/core/prisma.js";
import { characterInclude } from "@/lib/character/character-include.js";
import { serializeCharacter } from "@/lib/character/character-serialize.js";

export const hitPointsRouter = Router({ mergeParams: true });

// Per-op Zod schemas, discriminated on `type`.
const damageOpSchema = z.object({
  type: z.literal("damage"),
  amount: z.number().int().positive(),
  // Optional 5e damage type; drives resistance auto-halving (#456).
  damageType: z.string().min(1).optional(),
  // Manual override for resistance halving (#456): false declines the auto-halve.
  applyResistance: z.boolean().optional(),
  // Issue #76: defer the concentration save to the client when false. Omitted
  // or true keeps the server-side auto-roll.
  autoRollConcentration: z.boolean().optional(),
});

const healOpSchema = z.object({
  type: z.literal("heal"),
  amount: z.number().int().positive(),
});

const setTempOpSchema = z.object({
  type: z.literal("setTemp"),
  amount: z.number().int().nonnegative(),
});

// `rolls` may be empty (spending 0 dice is a no-op; UI typically disables this).
// Upper-bound / range validation is done in lib/combat/hitpoints.ts based on live state.
const shortRestOpSchema = z.object({
  type: z.literal("shortRest"),
  rolls: z.array(z.number().int().min(1)).min(0),
});

const longRestOpSchema = z.object({
  type: z.literal("longRest"),
});

// `roll` is optional in Zod — the lib validates it's present and in-range
// when method === "roll". `target` (issue #124) chooses which class advances;
// omitted keeps the backward-compatible position-0 self-heal.
const levelUpTargetSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("existing"), classEntryId: z.string().min(1) }),
  z.object({ kind: z.literal("new"), classId: z.string().min(1) }),
]);

const levelUpOpSchema = z.object({
  type: z.literal("levelUp"),
  method: z.enum(["average", "roll"]),
  roll: z.number().int().min(1).optional(),
  target: levelUpTargetSchema.optional(),
});

const deathSaveOpSchema = z.object({
  type: z.literal("deathSave"),
  roll: z.number().int().min(1).max(20),
});

const stabilizeOpSchema = z.object({
  type: z.literal("stabilize"),
});

// Issue #76: resolve a deferred concentration save with a client-rolled d20.
// `damage` lets the server recompute the DC (it never trusts a client DC);
// `roll` is the only trusted-but-validated input, like deathSave.
const concentrationSaveOpSchema = z.object({
  type: z.literal("concentrationSave"),
  entryId: z.string().min(1),
  roll: z.number().int().min(1).max(20),
  damage: z.number().int().positive(),
});

const operationSchema = z.discriminatedUnion("type", [
  damageOpSchema,
  healOpSchema,
  setTempOpSchema,
  shortRestOpSchema,
  longRestOpSchema,
  levelUpOpSchema,
  deathSaveOpSchema,
  stabilizeOpSchema,
  concentrationSaveOpSchema,
]);

const hpRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
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
