import { Router } from "express";
import { dismissInboxFlagSchema } from "@character-sheet/contracts";

import { assertCampaignOwner } from "@/lib/auth/access.js";
import { buildInboxRows, filterDismissed, signatureBelongsToCampaign } from "@/lib/campaign/inbox.js";
import { parseBodyOr400 } from "@/lib/http/parse-body.js";
import { prisma } from "@/lib/core/prisma.js";

// App-level inbox (#1945): derived DM housekeeping flags across every
// campaign the caller OWNS. Plain-REST like entities.ts/campaigns.ts — no
// audit log, no transaction-op pattern. Rows are recomputed on every GET
// (derive-don't-persist); only a dismissal is ever written.
export const inboxRouter = Router();

/**
 * GET /api/inbox
 * Newest-signal-first duplicate-cluster and needs-chronicling rows, minus
 * whatever this user already dismissed.
 */
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

/**
 * POST /api/inbox/dismissals
 * User-scoped preference state, not character/campaign domain state — plain
 * REST is correct here (precedent: CampaignCharacterPreference), no
 * transaction-endpoint requirement. Idempotent on the (userId, campaignId,
 * kind, signature) unique: dismissing an already-dismissed flag is a no-op.
 * Requires campaign OWNERSHIP (not mere membership) since every GET /api/inbox
 * row is itself owner-scoped. Also requires every id in `signature` to
 * actually belong to `campaignId` — otherwise an owner of two campaigns could
 * file a dismissal FK'd to one whose signature suppresses a flag in the
 * other (and whose cascade-cleanup would then target the wrong campaign).
 */
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
