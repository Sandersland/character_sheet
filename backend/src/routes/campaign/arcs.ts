import { Router } from "express";
import { createArcSchema, updateArcSchema } from "@character-sheet/contracts";

import type { CampaignArc } from "@/generated/prisma/client.js";
import { assertCampaignMembership, assertCampaignOwner } from "@/lib/auth/access.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

export const arcsRouter = Router();

const OWNER_ONLY = "Only the campaign owner may manage campaign arcs";

function serializeArc(row: CampaignArc) {
  return {
    id: row.id,
    campaignId: row.campaignId,
    name: row.name,
    position: row.position,
    createdAt: row.createdAt,
  };
}

arcsRouter.get("/campaigns/:id/arcs", async (req, res) => {
  await assertCampaignMembership(prisma, req.user!.id, req.params.id, "view");

  // createdAt is a deterministic tiebreak: concurrent creates can land on the same position.
  const arcs = await prisma.campaignArc.findMany({
    where: { campaignId: req.params.id },
    orderBy: [{ position: "asc" }, { createdAt: "asc" }],
  });
  res.json(arcs.map(serializeArc));
});

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

// Persists whatever position is sent as-is — sequence normalization is the caller's job (#864).
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

// Sessions SetNull their arcId on delete — never cascades to sessions or journal entries.
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
