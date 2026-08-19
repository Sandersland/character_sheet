/**
 * POST /api/inbox/dismissals request schema (#1945, epic #1369). Dismisses one
 * derived inbox flag for the caller: `kind` matches the wire `kind` GET
 * /api/inbox returns on each row, `signature` is that row's stable identity —
 * the sorted, comma-joined ids of the entities driving the flag, for BOTH
 * kinds (buildInboxRows: `clusterSignature`). `campaignId` must own every one
 * of those entity ids — the server checks this so a dismissal can't be filed
 * against one campaign to silently suppress a flag in another.
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
