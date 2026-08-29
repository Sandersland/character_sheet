/** `dateSchema` `.transform()`s a `YYYY-MM-DD` string to a `Date`; its client-facing type must be `z.input`, not `z.infer`/`z.output` (which would be `Date`, never sent over JSON). */
import { z } from "zod";

// Pins to UTC midnight so the stored value can't drift a day from what the user picked; a bare z.coerce.date() would accept a tz-offset datetime and shift the date.
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a YYYY-MM-DD calendar date")
  .transform((s) => new Date(`${s}T00:00:00.000Z`));
export type JournalDateInput = z.input<typeof dateSchema>;

// `date` is required for ENTRY but optional (defaults to today) for a NOTE.
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
