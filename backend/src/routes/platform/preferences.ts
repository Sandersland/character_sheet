import { Router } from "express";

import type { Prisma } from "@/generated/prisma/client.js";
import { prisma } from "@/lib/core/prisma.js";
import {
  mergePreferencesPatch,
  preferencesPatchSchema,
  resolvePreferences,
} from "@/lib/preferences/preferences.js";

export const preferencesRouter = Router();

/**
 * PATCH /api/preferences
 * Account-synced player preferences (#1178: theme, dice-roll style,
 * auto-roll concentration). Deliberately a plain field-patch, NOT a
 * …/transactions endpoint — the CLAUDE.md transactions rule governs mutable
 * CHARACTER-SHEET domains; these are account settings, scoped to the signed-in
 * user, not sheet state, so a thin PATCH is the correct shape here.
 */
preferencesRouter.patch("/preferences", async (req, res) => {
  const parseResult = preferencesPatchSchema.safeParse(req.body);
  if (!parseResult.success) {
    res.status(400).json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  const existing = await prisma.user.findUniqueOrThrow({
    where: { id: req.user!.id },
    select: { preferences: true },
  });

  // mergePreferencesPatch returns a plain object shaped by validated data
  // (preferencesPatchSchema) merged onto whatever Prisma handed back as
  // Json — safe to hand back to Prisma as InputJsonValue.
  const merged = mergePreferencesPatch(existing.preferences, parseResult.data) as Prisma.InputJsonValue;
  await prisma.user.update({ where: { id: req.user!.id }, data: { preferences: merged } });

  res.json({ preferences: resolvePreferences(merged) });
});
