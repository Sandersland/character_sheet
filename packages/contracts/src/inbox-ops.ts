/** `signature` is the sorted, comma-joined ids of the entities driving the flag; `campaignId` must own every one of them, checked server-side so a dismissal can't cross campaigns. */
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
