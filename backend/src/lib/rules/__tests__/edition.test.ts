// Every value below is asserted against a literal, never against another value in this module — RULES_EDITION_DISPLAY_ORDER (a product choice) and DEFAULT_RULES_EDITION (mirrors Character.rulesEdition's Prisma default) must be free to drift independently.
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

  // isRulesEdition reads ALL_RULES_EDITIONS, a separate array from RULES_EDITION_DISPLAY_ORDER; TS `readonly` is compile-time only, so this mutates the exported array in place and restores it in `finally`.
  it("stays correct independent of RULES_EDITION_DISPLAY_ORDER's order or length", () => {
    const mutableOrder = RULES_EDITION_DISPLAY_ORDER as RulesEdition[];
    const original = [...mutableOrder];
    try {
      mutableOrder.reverse();
      expect(isRulesEdition("EDITION_2014")).toBe(true);
      expect(isRulesEdition("EDITION_2024")).toBe(true);

      mutableOrder.length = 0;
      mutableOrder.push("EDITION_2014");
      expect(isRulesEdition("EDITION_2024")).toBe(true);
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
