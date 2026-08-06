/**
 * Session request schema (#1394, epic #1369) for
 * `PATCH /api/campaigns/:campaignId/sessions/:sessionId`
 * (`backend/src/routes/session/sessions.ts`). Plain-REST, not a
 * discriminated-union "op" — see the route's own why-comment.
 *
 * `PatchSessionInput` is `z.input<typeof patchSessionSchema>` per this
 * package's locked policy (index.ts, #1395); the whole-object `.refine()`
 * doesn't touch the input/output shape, so this is spelled `z.input` for
 * uniformity, not because it diverges from `z.infer` here.
 */
import { z } from "zod";

export const patchSessionSchema = z
  .object({
    title: z.string().min(1).nullable().optional(),
    arcId: z.string().min(1).nullable().optional(),
  })
  .strict()
  .refine((v) => v.title !== undefined || v.arcId !== undefined, {
    message: "Provide at least one of title or arcId",
  });
export type PatchSessionInput = z.input<typeof patchSessionSchema>;
