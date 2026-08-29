import { Router } from "express";

import type { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import {
  mergePreferencesPatch,
  preferencesPatchSchema,
  resolvePreferences,
} from "@/lib/preferences/preferences.js";

export const preferencesRouter = Router();

/** PATCH /api/preferences — deliberately a plain field-patch, not a …/transactions endpoint, since these are account settings, not character-sheet state. */
preferencesRouter.patch("/preferences", async (req, res) => {
  const parseResult = preferencesPatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const userId = req.user!.id;

  // Read-modify-write under a row lock (FOR UPDATE), not a plain $transaction: under READ COMMITTED, two tabs patching different keys would otherwise both read the same base and the later write would drop the earlier key.
  const merged = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ preferences: unknown }[]>`
      SELECT preferences FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
    // Safe to hand back to Prisma as InputJsonValue: mergePreferencesPatch returns a plain object, not raw Json.
    const next = mergePreferencesPatch(row?.preferences, parseResult.data) as Prisma.InputJsonValue;
    await tx.user.update({ where: { id: userId }, data: { preferences: next } });
    return next;
  });

  res.json({ preferences: resolvePreferences(merged) });
});
