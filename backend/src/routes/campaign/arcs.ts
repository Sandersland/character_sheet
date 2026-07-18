import { Router } from "express";
import { z } from "zod";

import type { CampaignArc } from "@/generated/prisma/client.js";
import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

// Campaign arcs / "parts" (#863): named groupings the journal page files sessions
// ("chapters") under so a long campaign stays navigable. Arcs are campaign-level
// (one shared story spine) and DM-curated, so this is plain owner-gated REST CRUD
// (like campaign-items.ts) — NOT the character transaction/audit pattern, since an
// arc carries no character-sheet mechanical effect. `position` is an explicit
// ordering column; a create appends (position = current count) and a patch may
// reorder by setting it directly. Deleting an arc SetNulls its sessions' arcId
// (schema relation), so sessions and their journal entries always survive.

export const arcsRouter = Router();

const OWNER_ONLY = "Only the campaign owner may manage campaign arcs";

const createArcSchema = z.object({ name: z.string().min(1) }).strict();
const updateArcSchema = z
  .object({ name: z.string().min(1).optional(), position: z.number().int().min(0).optional() })
  .strict()
  .refine((v) => v.name !== undefined || v.position !== undefined, {
    message: "Provide at least one of name or position",
  });

function serializeArc(row: CampaignArc) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt,
  };
}

/**
 * GET /api/campaigns/:id/arcs
 * Member-readable ordered list (the journal spine). Any campaign member sees it.
 */
arcsRouter.get("/campaigns/:id/arcs", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  // Order by [position, createdAt] in EVERY read path: two concurrent DM creates
  // can both read the same arc count and land on the same `position` (the POST
  // below isn't transactional), so createdAt is the deterministic tiebreak that
  // keeps tied arcs in a stable order. A hardening UNIQUE(campaignId, position)
  // constraint would fight the PATCH reorder flow, so it's tracked as a follow-up.
  const arcs = await prisma.campaignArc.findMany({
    where: { campaignId: req.params.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  res.json(arcs.map(serializeArc));
});

/**
 * POST /api/campaigns/:id/arcs
 * Owner-only create; position appends (= current arc count). The count+create
 * isn't atomic, so two concurrent DM creates can tie on `position`; that's made
 * harmless by the [position, createdAt] read ordering above (hardening constraint
 * is a tracked follow-up).
 */
arcsRouter.post("/campaigns/:id/arcs", async (req, res) => {
  await assertCampaignOwner(prisma, req.user!.id, req.params.id, "edit", OWNER_ONLY);

  const data = parseBodyOr400(createArcSchema, req.body, res);
  if (data === undefined) return;

  const count = await prisma.campaignArc.count({ where: { campaignId: req.params.id } });
  const arc = await prisma.campaignArc.create({
    data: { campaignId: req.params.id, name: data.name, position: count },
  });
  res.status(201).json(serializeArc(arc));
});

/**
 * PATCH /api/campaigns/:id/arcs/:arcId
 * Owner-only rename and/or reorder. Full sequence normalization is the caller's
 * job (#864); this persists whatever name/position the owner sends.
 */
arcsRouter.patch("/campaigns/:id/arcs/:arcId", async (req, res) => {
  await assertCampaignOwner(prisma, req.user!.id, req.params.id, "edit", OWNER_ONLY);

  const data = parseBodyOr400(updateArcSchema, req.body, res);
  if (data === undefined) return;

  const existing = await prisma.campaignArc.findUnique({ where: { id: req.params.arcId } });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Arc not found" });
    return;
  }

  const arc = await prisma.campaignArc.update({
    where: { id: existing.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.position !== undefined ? { position: data.position } : {}),
    },
  });
  res.json(serializeArc(arc));
});

/**
 * DELETE /api/campaigns/:id/arcs/:arcId
 * Owner-only. Sessions fall back to un-arced via the SetNull relation — deleting
 * an arc never deletes a session or its journal entries.
 */
arcsRouter.delete("/campaigns/:id/arcs/:arcId", async (req, res) => {
  await assertCampaignOwner(prisma, req.user!.id, req.params.id, "edit", OWNER_ONLY);

  const existing = await prisma.campaignArc.findUnique({ where: { id: req.params.arcId } });
  if (!existing || existing.campaignId !== req.params.id) {
    res.status(404).json({ error: "Arc not found" });
    return;
  }

  await prisma.campaignArc.delete({ where: { id: existing.id } });
  res.status(204).end();
});
