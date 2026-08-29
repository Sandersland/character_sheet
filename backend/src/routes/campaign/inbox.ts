import { Router } from "express";
import { dismissInboxFlagSchema } from "@character-sheet/contracts";

import { assertCampaignOwner } from "@/lib/auth/access.js";
import { buildInboxRows, filterDismissed, signatureBelongsToCampaign } from "@/lib/campaign/inbox.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

// Rows are recomputed on every GET; only a dismissal is ever persisted.
export const inboxRouter = Router();

inboxRouter.get("/inbox", async (req, res) => {
  const userId = req.user!.id;
  const [rows, dismissed] = await Promise.all([
    buildInboxRows(prisma, userId),
    prisma.inboxDismissal.findMany({
      where: { userId },
      select: { campaignId: true, kind: true, signature: true },
    }),
  ]);
  res.json(filterDismissed(rows, dismissed));
});

// Idempotent on the (userId, campaignId, kind, signature) unique.
// Requires campaign OWNERSHIP, not mere membership, since every GET /api/inbox row is itself owner-scoped.
inboxRouter.post("/inbox/dismissals", async (req, res) => {
  const data = parseBodyOr400(dismissInboxFlagSchema, req.body, res);
  if (data === undefined) return;

  await assertCampaignOwner(
    prisma,
    req.user!.id,
    data.campaignId,
    "edit",
    "You do not have access to this campaign",
  );

  if (!(await signatureBelongsToCampaign(prisma, data.campaignId, data.signature))) {
    res.status(400).json({ error: "signature does not belong to campaignId" });
    return;
  }

  // No check that kind matches a real row: a mismatched dismissal is inert (kind is part of filterDismissed's match key), not exploitable.
  await prisma.inboxDismissal.upsert({
    where: {
      userId_campaignId_kind_signature: {
        userId: req.user!.id,
        campaignId: data.campaignId,
        kind: data.kind,
        signature: data.signature,
      },
    },
    create: {
      userId: req.user!.id,
      campaignId: data.campaignId,
      kind: data.kind,
      signature: data.signature,
    },
    update: {},
  });

  res.status(201).json({ ok: true });
});
