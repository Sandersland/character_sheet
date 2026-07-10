import { describe, expect, it } from "vitest";

import { prisma } from "@/lib/prisma.js";

// Mirrors the backfill CASE in migrations/…_campaign_item_rarity_enum. Exercising
// the same expression in Postgres guards the case-insensitive mapping: known
// values map to their tier, blank/unrecognized text → NULL.
function mapRaritySql(input: string | null) {
  return prisma.$queryRaw<{ mapped: string | null }[]>`
    SELECT (
      CASE lower(trim(${input}))
        WHEN 'common' THEN 'COMMON'
        WHEN 'uncommon' THEN 'UNCOMMON'
        WHEN 'rare' THEN 'RARE'
        WHEN 'very rare' THEN 'VERY_RARE'
        WHEN 'very_rare' THEN 'VERY_RARE'
        WHEN 'legendary' THEN 'LEGENDARY'
        WHEN 'artifact' THEN 'ARTIFACT'
        ELSE NULL
      END
    ) AS mapped`;
}

describe("campaign item rarity migration mapping (#497)", () => {
  it.each([
    ["rare", "RARE"],
    ["RARE", "RARE"],
    ["Legendary", "LEGENDARY"],
    ["very rare", "VERY_RARE"],
    ["Very_Rare", "VERY_RARE"],
    ["  common  ", "COMMON"],
    ["ARTIFACT", "ARTIFACT"],
  ])("maps %s → %s case-insensitively", async (input, expected) => {
    const rows = await mapRaritySql(input);
    expect(rows[0].mapped).toBe(expected);
  });

  it.each([[""], ["  "], ["mythic"], ["not-a-tier"]])(
    "maps unrecognized/blank %j → NULL",
    async (input) => {
      const rows = await mapRaritySql(input);
      expect(rows[0].mapped).toBeNull();
    },
  );
});
