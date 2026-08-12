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
  ALL_RULES_EDITIONS,
  DEFAULT_RULES_EDITION,
  EDITION_DESCRIPTIONS,
  RULES_EDITION_DISPLAY_ORDER,
  RULES_EDITION_LABELS,
  isRulesEdition,
} from "@/lib/rules/edition.js";
import type { RulesEdition } from "@character-sheet/shared-types";

describe("ALL_RULES_EDITIONS", () => {
  it("is exactly the RulesEdition members (#1527) — the validity set, order-independent", () => {
    expect([...ALL_RULES_EDITIONS].sort()).toEqual(["EDITION_2014", "EDITION_2024"]);
  });
});

describe("RULES_EDITION_DISPLAY_ORDER", () => {
  it("is 2024 first, 2014 second", () => {
    expect(RULES_EDITION_DISPLAY_ORDER).toEqual(["EDITION_2024", "EDITION_2014"]);
  });

  // #1527: display order is now a PERMUTATION of ALL_RULES_EDITIONS, not the
  // validity set itself — no missing member, no duplicate, no stranger.
  it("is a permutation of ALL_RULES_EDITIONS", () => {
    expect([...RULES_EDITION_DISPLAY_ORDER].sort()).toEqual([...ALL_RULES_EDITIONS].sort());
    expect(new Set(RULES_EDITION_DISPLAY_ORDER).size).toBe(RULES_EDITION_DISPLAY_ORDER.length);
  });
});

describe("isRulesEdition", () => {
  it("membership-tests ALL_RULES_EDITIONS, the validity set, order-independently", () => {
    expect(isRulesEdition("EDITION_2014")).toBe(true);
    expect(isRulesEdition("EDITION_2024")).toBe(true);
    expect(isRulesEdition("EDITION_2000")).toBe(false);
    expect(isRulesEdition(undefined)).toBe(false);
  });

  // Mutation proof (#1527's own acceptance criterion): reordering or
  // shortening RULES_EDITION_DISPLAY_ORDER must not change what counts as a
  // valid edition — isRulesEdition reads ALL_RULES_EDITIONS, a SEPARATE
  // array, never this one. Mutates the exported array in place (TS `readonly`
  // is compile-time only) and restores it in `finally` so no other test
  // observes the mutation.
  it("stays correct independent of RULES_EDITION_DISPLAY_ORDER's order or length", () => {
    const mutableOrder = RULES_EDITION_DISPLAY_ORDER as RulesEdition[];
    const original = [...mutableOrder];
    try {
      mutableOrder.reverse();
      expect(isRulesEdition("EDITION_2014")).toBe(true);
      expect(isRulesEdition("EDITION_2024")).toBe(true);

      mutableOrder.length = 0;
      mutableOrder.push("EDITION_2014"); // shortened — 2024 dropped from display order
      expect(isRulesEdition("EDITION_2024")).toBe(true); // still a valid edition
      expect(isRulesEdition("EDITION_2014")).toBe(true);
    } finally {
      mutableOrder.length = 0;
      mutableOrder.push(...original);
    }
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
