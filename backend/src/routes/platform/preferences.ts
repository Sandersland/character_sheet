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

  const userId = req.user!.id;

  // Read-modify-write under a row lock. Unlocked, two tabs patching DIFFERENT
  // keys both read the same base and the later write drops the earlier key.
  // The lock (not a plain `$transaction`, which under the default READ
  // COMMITTED still lets both reads see the pre-write row) is what makes
  // "patching key K never clobbers key L" true. A single SQL `||` jsonb merge
  // would also be atomic but skips mergePreferencesPatch's sanitization of the
  // stored base — pinned by the hostile-stored-base test.
  const merged = await prisma.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ preferences: unknown }[]>`
      SELECT preferences FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
    // mergePreferencesPatch returns a plain object shaped by validated data
    // (preferencesPatchSchema) merged onto whatever the driver handed back as
    // Json — safe to hand back to Prisma as InputJsonValue.
    const next = mergePreferencesPatch(row?.preferences, parseResult.data) as Prisma.InputJsonValue;
    await tx.user.update({ where: { id: userId }, data: { preferences: next } });
    return next;
  });

  res.json({ preferences: resolvePreferences(merged) });
});
