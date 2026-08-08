/**
 * Journal-entry request schemas (#1394, epic #1369) for
 * `backend/src/routes/session/journal.ts`. Plain-REST, not a
 * discriminated-union "op" — see the route's own why-comment.
 *
 * This is the family that actually needs this package's z.input policy
 * (index.ts, #1395), not just spells it for uniformity:
 *
 * - `dateSchema` `.transform()`s a `YYYY-MM-DD` string to a `Date`. Its
 *   client-facing type MUST be `z.input` (the string the client's
 *   `<input type="date">` produces) — `z.infer`/`z.output` would be `Date`,
 *   which a client never constructs to send over JSON.
 * - `createJournalSchema.kind` has `.default("ENTRY")`, so `z.input` makes it
 *   optional — the same divergence shape preferences-ops.ts documents.
 */
import { z } from "zod";

// `date` is a calendar date with no meaningful time-of-day. Accept ONLY the
// yyyy-mm-dd string the client's <input type="date"> produces and pin it to
// UTC midnight, so the stored value can never drift a day from what the user
// picked. (A bare z.coerce.date() would accept tz-offset datetimes like
// "2026-06-22T23:00:00-05:00" -> stored 2026-06-23, displayed a day off.)
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));
export type JournalDateInput = z.input<typeof dateSchema>;

// date is required for ENTRY (the full form) but defaults to today for a NOTE.
export const createJournalSchema = z
  .object({
    kind: z.enum(["NOTE", "ENTRY"]).default("ENTRY"),
    date: dateSchema.optional(),
    body: z.string().min(1),
    sessionId: z.string().optional(),
    visibility: z.enum(["PRIVATE", "CAMPAIGN"]).optional(),
  })
  .strict()
  .refine((d) => d.kind !== "ENTRY" || d.date !== undefined, {
    message: "date is required for an ENTRY",
    path: ["date"],
  });
export type CreateJournalInput = z.input<typeof createJournalSchema>;

export const updateJournalSchema = z
  .object({
    date: dateSchema,
    body: z.string().min(1),
    visibility: z.enum(["PRIVATE", "CAMPAIGN"]),
  })
  .partial()
  .strict();
export type UpdateJournalInput = z.input<typeof updateJournalSchema>;
