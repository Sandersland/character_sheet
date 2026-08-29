// z.input/z.output equality is asserted since none of these schemas use .default()/.transform().
// expectTypeOf is erased at runtime — npm run typecheck is what actually gates this file (#1394).
import {
  ENTITY_TYPES,
  VISIBILITIES,
  attachCharacterSchema,
  createArcSchema,
  createCampaignSchema,
  createEntitySchema,
  joinCampaignSchema,
  updateArcSchema,
  updateEntitySchema,
  type CreateCampaignInput,
  type CreateEntityInput,
} from "@character-sheet/contracts";
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import type { RulesEdition } from "@character-sheet/shared-types";

describe("campaign/entity/arc op wire contract", () => {
  it("keeps every migrated schema's client-constructible input identical to its output", () => {
    expectTypeOf<z.input<typeof createCampaignSchema>>().toEqualTypeOf<
      z.output<typeof createCampaignSchema>
    >();
    expectTypeOf<z.input<typeof joinCampaignSchema>>().toEqualTypeOf<
      z.output<typeof joinCampaignSchema>
    >();
    expectTypeOf<z.input<typeof attachCharacterSchema>>().toEqualTypeOf<
      z.output<typeof attachCharacterSchema>
    >();
    expectTypeOf<z.input<typeof createEntitySchema>>().toEqualTypeOf<
      z.output<typeof createEntitySchema>
    >();
    expectTypeOf<z.input<typeof updateEntitySchema>>().toEqualTypeOf<
      z.output<typeof updateEntitySchema>
    >();
    expectTypeOf<z.input<typeof createArcSchema>>().toEqualTypeOf<z.output<typeof createArcSchema>>();
    expectTypeOf<z.input<typeof updateArcSchema>>().toEqualTypeOf<z.output<typeof updateArcSchema>>();
  });

  it("exports CreateEntityInput as z.input, matching this package's locked policy", () => {
    expectTypeOf<CreateEntityInput>().toEqualTypeOf<z.input<typeof createEntitySchema>>();
  });

  it("rejects an entity type or visibility outside the shared tuples", () => {
    expect(createEntitySchema.safeParse({ type: "DRAGON", name: "Smaug" }).success).toBe(false);
    expect(
      createEntitySchema.safeParse({ type: "NPC", name: "Smaug", visibility: "SECRET" }).success,
    ).toBe(false);
  });

  it("keeps ENTITY_TYPES/VISIBILITIES as the single source both the schemas and the route's own filters read", () => {
    expect(ENTITY_TYPES).toEqual(["NPC", "LOCATION", "FACTION", "ITEM", "PC", "OTHER"]);
    expect(VISIBILITIES).toEqual(["HIDDEN", "REVEALED"]);
  });

  it("requires at least one of name/position on an arc update", () => {
    expect(updateArcSchema.safeParse({}).success).toBe(false);
    expect(updateArcSchema.safeParse({ name: "New name" }).success).toBe(true);
    expect(updateArcSchema.safeParse({ position: 2 }).success).toBe(true);
  });

  // Exhaustiveness latch (#1527): adding a RulesEdition member without updating createCampaignSchema's z.enum fails at typecheck, not silently.
  it("keeps rulesEdition's enum in lockstep with RulesEdition", () => {
    expectTypeOf<CreateCampaignInput["rulesEdition"]>().toEqualTypeOf<RulesEdition | undefined>();
  });
});
