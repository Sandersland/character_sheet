/**
 * POST /api/inbox/dismissals request schema (#1945, epic #1369). Dismisses one
 * derived inbox flag for the caller: `kind` matches the wire `kind` GET
 * /api/inbox returns on each row, `signature` is that row's stable identity
 * (sorted entity ids for a duplicate cluster; the campaign id for
 * needs-chronicling — see `backend/src/lib/campaign/inbox.ts`).
 */
import { z } from "zod";

export const INBOX_FLAG_KINDS = ["DUPLICATE_CLUSTER", "NEEDS_CHRONICLING"] as const;

export const dismissInboxFlagSchema = z
  .object({
    campaignId: z.string().min(1),
    kind: z.enum(INBOX_FLAG_KINDS),
    signature: z.string().min(1),
  })
  .strict();
export type DismissInboxFlagInput = z.input<typeof dismissInboxFlagSchema>;
