/**
 * The one RulesEdition order array and the creation default (#1436).
 *
 * Every value below is asserted against a LITERAL, never against another value
 * in this module — in particular never `RULES_EDITION_DISPLAY_ORDER[0] ===
 * DEFAULT_RULES_EDITION`. Display order is a product choice; the default mirrors
 * `Character.rulesEdition`'s Prisma `@default`. Coupling the two would let
 * either drift silently behind the other, recreate backend-side the positional
 * coupling #1436 deleted from the client, and pre-break #1372 the moment a
 * product decision shows 2014 first. `reference.ts` states the same rule for the
 * same reason on `subclassGateLevel`.
 */
import { describe, expect, it } from "vitest";

import {
  DEFAULT_RULES_EDITION,
  EDITION_DESCRIPTIONS,
  RULES_EDITION_DISPLAY_ORDER,
  RULES_EDITION_LABELS,
  isRulesEdition,
} from "@/lib/rules/edition.js";

describe("RULES_EDITION_DISPLAY_ORDER", () => {
  it("is 2024 first, 2014 second", () => {
    expect(RULES_EDITION_DISPLAY_ORDER).toEqual(["EDITION_2024", "EDITION_2014"]);
  });

  it("is the only order array — isRulesEdition membership-tests it, order-independently", () => {
    expect(isRulesEdition("EDITION_2014")).toBe(true);
    expect(isRulesEdition("EDITION_2024")).toBe(true);
    expect(isRulesEdition("EDITION_2000")).toBe(false);
    expect(isRulesEdition(undefined)).toBe(false);
  });
});

describe("DEFAULT_RULES_EDITION", () => {
  it("is EDITION_2024, mirroring the Prisma column default", () => {
    expect(DEFAULT_RULES_EDITION).toBe("EDITION_2024");
  });
});

describe("edition copy", () => {
  it("labels both editions in plain words, never an SRD citation", () => {
    expect(RULES_EDITION_LABELS).toEqual({ EDITION_2014: "2014 rules", EDITION_2024: "2024 rules" });
    for (const text of [...Object.values(RULES_EDITION_LABELS), ...Object.values(EDITION_DESCRIPTIONS)]) {
      expect(text).not.toMatch(/SRD/i);
    }
  });
});
