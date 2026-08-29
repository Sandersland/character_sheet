import { Router } from "express";
import { catalogForkSchema, type CatalogForkInput } from "@character-sheet/contracts";

import type { CatalogEntry, Spell } from "@/generated/prisma/client.js";
import { assertCampaignOwner } from "@/lib/auth/access.js";
import { AuthorizationError, NotFoundError } from "@/lib/auth/errors.js";
import { forkContent, type ForkTarget } from "@/lib/catalog/fork.js";
import { isCatalogEntryVisibleToUser } from "@/lib/catalog/entitlement.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";
import { undefinedSpellEffectFields } from "@/lib/spellcasting/spell-effect-fields.js";

export const forkRouter = Router();

async function assertCatalogEntryVisible(userId: string, entryId: string): Promise<CatalogEntry> {
  const entry = await prisma.catalogEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new NotFoundError("Catalog entry not found");
  if (await isCatalogEntryVisibleToUser(entry, userId)) return entry;
  throw new AuthorizationError("You do not have access to this catalog entry");
}

async function resolveForkTarget(userId: string, input: CatalogForkInput): Promise<ForkTarget> {
  if (input.scope === "USER") {
    return { scope: "USER", ownerUserId: userId };
  }
  // catalogForkSchema's refine guarantees campaignId is present when scope is CAMPAIGN.
  await assertCampaignOwner(prisma, userId, input.campaignId!, "edit", "Only that campaign's DM can fork content into it");
  return { scope: "CAMPAIGN", ownerCampaignId: input.campaignId! };
}

function serializeForkedSpell(entry: CatalogEntry, spell: Spell, classes: string[]) {
  return {
    id: spell.id,
    name: spell.name,
    level: spell.level,
    school: spell.school,
    castingTime: spell.castingTime,
    range: spell.range,
    duration: spell.duration,
    description: spell.description,
    concentration: spell.concentration,
    ritual: spell.ritual,
    classes,
    cantripScaling: spell.cantripScaling,
    ...undefinedSpellEffectFields(spell),
    // editable: true is safe here — resolveForkTarget already gated the target to one the forker can edit.
    catalog: { entryId: entry.id, scope: entry.scope, isFork: true, forkedFromId: entry.forkedFromId, editable: true },
  };
}

/**
 * POST /api/catalog/entries/:entryId/fork
 * A self-contained deep copy of `:entryId`'s content into a new entry the
 * caller owns. Only SPELL exists today.
 */
forkRouter.post("/catalog/entries/:entryId/fork", async (req, res) => {
  const data = parseBodyOr400(catalogForkSchema, req.body, res);
  if (data === undefined) return;

  const userId = req.user!.id;
  const origin = await assertCatalogEntryVisible(userId, req.params.entryId);
  const target = await resolveForkTarget(userId, data);

  const { entry, spell, classes } = await forkContent(origin.kind, origin.id, target);

  res.status(201).json({ entryId: entry.id, spell: serializeForkedSpell(entry, spell, classes) });
});
