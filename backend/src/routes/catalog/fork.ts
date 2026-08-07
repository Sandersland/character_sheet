import { Router } from "express";
import { catalogForkSchema, type CatalogForkInput } from "@character-sheet/contracts";

import type { CatalogEntry, Spell } from "@/generated/prisma/client.js";
import { assertCampaignOwner } from "@/lib/auth/access.js";
import { AuthorizationError, NotFoundError } from "@/lib/auth/errors.js";
import { forkContent, type ForkTarget } from "@/lib/catalog/fork.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

// Fork (make an overriding copy) route (#1800, epic #1795 5/6): a viewer
// copies visible content into their own USER stash, or a campaign's DM copies
// it into that campaign's CAMPAIGN scope. The resulting entry's
// `forkedFromId` shadows the origin once the read resolver (slice 2, #1797)
// lands — that assertion is deliberately NOT covered here (not on this
// branch); see this PR's own description.

export const forkRouter = Router();

// Visibility check ahead of a fork (#1800): the same "GLOBAL or the caller's
// own USER row or a CAMPAIGN row the caller belongs to" rule spells.ts's own
// GET /api/spells TEMPORARILY applies pending the read resolver (slice 2,
// #1797) — duplicated here rather than imported because that route's check is
// inlined into its own query, not a shared helper. Both call sites are meant
// to collapse onto the resolver once it lands.
async function assertCatalogEntryVisible(userId: string, entryId: string): Promise<CatalogEntry> {
  const entry = await prisma.catalogEntry.findUnique({ where: { id: entryId } });
  if (!entry) throw new NotFoundError("Catalog entry not found");

  if (entry.scope === "GLOBAL") return entry;
  if (entry.scope === "USER" && entry.ownerUserId === userId) return entry;
  if (entry.scope === "CAMPAIGN" && entry.ownerCampaignId) {
    const membership = await prisma.campaignMembership.findUnique({
      where: { campaignId_userId: { campaignId: entry.ownerCampaignId, userId } },
      select: { userId: true },
    });
    if (membership) return entry;
  }
  throw new AuthorizationError("You do not have access to this catalog entry");
}

// Resolves the fork's destination + authorizes it: USER always admits the
// caller (they can always fork visible content into their own stash);
// CAMPAIGN requires the caller be that campaign's DM (assertCampaignOwner —
// 404 missing campaign, 403 member-but-not-DM, 403 non-member).
async function resolveForkTarget(userId: string, input: CatalogForkInput): Promise<ForkTarget> {
  if (input.scope === "USER") {
    return { scope: "USER", ownerUserId: userId };
  }
  // catalogForkSchema's own refine guarantees campaignId is present exactly
  // when scope is CAMPAIGN.
  await assertCampaignOwner(prisma, userId, input.campaignId!, "edit", "Only that campaign's DM can fork content into it");
  return { scope: "CAMPAIGN", ownerCampaignId: input.campaignId! };
}

// Same nullable-on-Spell columns spells.ts's own UNDEFINED_DEFAULTED_FIELD_NAMES
// walks (custom-spells.ts's EFFECT_FIELD_NAMES is the same list again) — a
// loop over one list rather than nine hand-written `?? undefined` object
// entries, which is what pushed this function's complexity over the fallow
// gate before this extraction.
const UNDEFINED_DEFAULTED_FIELD_NAMES = [
  "effectKind",
  "effectDiceCount",
  "effectDiceFaces",
  "effectModifier",
  "damageType",
  "attackType",
  "saveAbility",
  "saveEffect",
  "upcastDicePerLevel",
] as const satisfies readonly (keyof Spell)[];
type UndefinedDefaultedFieldName = (typeof UNDEFINED_DEFAULTED_FIELD_NAMES)[number];
type UndefinedDefaultedFields = { [K in UndefinedDefaultedFieldName]: Spell[K] | undefined };

function undefinedDefaultedFields(spell: Spell): UndefinedDefaultedFields {
  const out = {} as Record<UndefinedDefaultedFieldName, unknown>;
  for (const name of UNDEFINED_DEFAULTED_FIELD_NAMES) {
    out[name] = spell[name] ?? undefined;
  }
  // Every value above came straight from Spell's own typed columns (or
  // undefined) — the single controlled cast back to the per-field union
  // UndefinedDefaultedFields declares, same rationale as spells.ts's own
  // undefinedDefaultedFields cast.
  return out as UndefinedDefaultedFields;
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
    ...undefinedDefaultedFields(spell),
    // `editable` is always true here (#1808 leak-fix, epic #1795 8/9
    // combined-state review): resolveForkTarget above already gated the
    // target — USER always admits the forker as owner, CAMPAIGN only via
    // assertCampaignOwner — so the entry this function serializes is, by
    // construction, one the forker can edit. Same rule
    // isCatalogEntryEditable expresses (lib/catalog/entitlement.ts), already
    // enforced by this route's own auth step; no second query to re-derive it.
    catalog: { entryId: entry.id, scope: entry.scope, isFork: true, forkedFromId: entry.forkedFromId, editable: true },
  };
}

/**
 * POST /api/catalog/entries/:entryId/fork
 * A self-contained deep copy of `:entryId`'s content into a new entry the
 * caller owns (#1800). Only SPELL exists today (forkContent's own
 * kind-dispatch is where a future kind widens).
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
