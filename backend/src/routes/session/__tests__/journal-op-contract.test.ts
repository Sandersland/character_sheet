// Latch for the journal schemas' z.input policy (#1394, #1395): dateSchema's client-facing type must stay the pre-transform string, and createJournalSchema.kind's z.input must stay optional under its .default("ENTRY").
import {
  createJournalSchema,
  dateSchema,
  updateJournalSchema,
  type CreateJournalInput,
  type JournalDateInput,
  type UpdateJournalInput,
} from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

describe("journal op wire contract", () => {
  it("diverges dateSchema's z.input (string) from its z.output (Date)", () => {
    expectTypeOf<z.input<typeof dateSchema>>().not.toEqualTypeOf<z.output<typeof dateSchema>>();
    expectTypeOf<JournalDateInput>().toEqualTypeOf<string>();
    expectTypeOf<z.output<typeof dateSchema>>().toEqualTypeOf<Date>();
  });

  it("diverges createJournalSchema's z.input from its z.output on the defaulted kind field", () => {
    expectTypeOf<z.input<typeof createJournalSchema>>().not.toEqualTypeOf<
      z.output<typeof createJournalSchema>
    >();
    expectTypeOf<CreateJournalInput>().toEqualTypeOf<z.input<typeof createJournalSchema>>();
  });

  it("exports UpdateJournalInput as z.input, matching this package's locked policy", () => {
    expectTypeOf<UpdateJournalInput>().toEqualTypeOf<z.input<typeof updateJournalSchema>>();
  });

  it("still transforms a valid YYYY-MM-DD string to UTC midnight", () => {
    const result = dateSchema.parse("2026-08-06");
    expect(result).toEqual(new Date("2026-08-06T00:00:00.000Z"));
  });

  it("rejects a non-calendar-date string", () => {
    expect(dateSchema.safeParse("08/06/2026").success).toBe(false);
    expect(dateSchema.safeParse("2026-06-22T23:00:00-05:00").success).toBe(false);
  });

  it("defaults kind to ENTRY and still requires date for an ENTRY", () => {
    expect(createJournalSchema.safeParse({ body: "note" }).success).toBe(false);
    const parsed = createJournalSchema.parse({ body: "note", date: "2026-08-06" });
    expect(parsed.kind).toBe("ENTRY");
  });

  it("allows a NOTE with no date", () => {
    expect(createJournalSchema.safeParse({ kind: "NOTE", body: "quick note" }).success).toBe(true);
  });
});
