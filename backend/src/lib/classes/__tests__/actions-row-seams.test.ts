// #1909: the two seams that unblock moving cross-class DERIVED_ACTIONS rows
// onto ClassFeature rows —
//   1. `ClassFeature.reminder` (static in-play announce text), served by
//      `buildRowAction` only when `describeRowReminder`'s derived heal text
//      yields nothing.
//   2. `actionFromRow`'s enablement gate reads `cost.key`/`cost.base` (the
//      COST POOL) rather than `row.resourceKey` (the row's own IDENTITY),
//      mirroring `toggleActionsFromRow`'s existing shape — an identity≠pool
//      spender (Metamagic: identity "metamagic", pool "sorceryPoints") would
//      otherwise check the wrong pool and render permanently disabled.
//
// Pure (no DB) — synthetic ClassFeatureRow fixtures exercised through
// `deriveEntryScopedActions`'s `getFeatureRows` carrier, the same seam
// entry-scoped-actions.test.ts uses for Fighter's row-driven actions.
import { describe, expect, it } from "vitest";

import { deriveEntryScopedActions } from "@/lib/classes/actions.js";
import type { ClassFeatureRow, ClassFeatureRowsCarrier } from "@/lib/classes/class-feature-rows.js";
import { testFeatureRowsFor } from "@/lib/classes/__tests__/test-feature-rows.fixture.js";

function carrierOf(classRows: ClassFeatureRow[]): ClassFeatureRowsCarrier {
  return { classRows, subclassRows: [] };
}

describe("ClassFeature.reminder (#1909)", () => {
  it("is served as the card's reminder when the row carries no derived heal text", () => {
    const row: ClassFeatureRow = {
      name: "Test Feature",
      level: 1,
      description: "Feature prose, not the reminder.",
      edition: "EDITION_2024",
      resourceKey: "testFeature",
      activationCost: "action",
      costKind: "pool",
      costPoolKey: "testFeature",
      costBase: 1,
      reminder: "Static in-play announce text.",
    };
    const actions = deriveEntryScopedActions(
      [{ name: "wizard", subclass: undefined, level: 1 }],
      1,
      [{ key: "testFeature", remaining: 1 }],
      true,
      "EDITION_2024",
      () => carrierOf([row]),
    );
    const card = actions.find((a) => a.key === "testFeature");
    expect(card?.reminder).toBe("Static in-play announce text.");
  });

  it("loses to the row's own derived heal text when both are present (Second Wind's subtitle stays unchanged)", () => {
    const row: ClassFeatureRow = {
      name: "Test Heal",
      level: 1,
      description: "Feature prose.",
      edition: "EDITION_2024",
      resourceKey: "testHeal",
      activationCost: "bonusAction",
      costKind: "pool",
      costPoolKey: "testHeal",
      costBase: 1,
      effectKind: "heal",
      effectDiceCount: 1,
      effectDiceFaces: 10,
      // Deliberately ALSO sets reminder — the derived heal text must win.
      reminder: "This text must never be served.",
    };
    const actions = deriveEntryScopedActions(
      [{ name: "wizard", subclass: undefined, level: 1 }],
      1,
      [{ key: "testHeal", remaining: 1 }],
      true,
      "EDITION_2024",
      () => carrierOf([row]),
    );
    const card = actions.find((a) => a.key === "testHeal");
    expect(card?.reminder).toBe("Regain 1d10 HP");
  });

  it("Fighter's real Second Wind row (no reminder column set) keeps its derived heal subtitle", () => {
    const getFeatureRows = (entry: { name: string; subclass?: string }) => testFeatureRowsFor(entry.name, entry.subclass);
    const actions = deriveEntryScopedActions(
      [{ name: "fighter", subclass: undefined, level: 3 }],
      3,
      [{ key: "secondWind", remaining: 1 }],
      true,
      "EDITION_2024",
      getFeatureRows,
    );
    const card = actions.find((a) => a.key === "secondWind");
    expect(card?.reminder).toBe("Regain 1d10 + 3 HP");
  });

  it("is absent from the card when neither derived heal text nor a reminder column is set", () => {
    const row: ClassFeatureRow = {
      name: "Test Bare",
      level: 1,
      description: "Feature prose.",
      edition: "EDITION_2024",
      resourceKey: "testBare",
      activationCost: "free",
      costKind: "pool",
      costPoolKey: "testBare",
      costBase: 1,
    };
    const actions = deriveEntryScopedActions(
      [{ name: "wizard", subclass: undefined, level: 1 }],
      1,
      [{ key: "testBare", remaining: 1 }],
      true,
      "EDITION_2024",
      () => carrierOf([row]),
    );
    const card = actions.find((a) => a.key === "testBare");
    expect(card).toBeDefined();
    expect(card?.reminder).toBeUndefined();
  });
});

describe("actionFromRow enablement gates on the cost pool, not the row's identity key (#1909)", () => {
  // An identity≠pool row, mirroring Metamagic's real shape (identity
  // "metamagic", cost pool "sorceryPoints") — served key stays the row's own
  // resourceKey (identity), but enabled/disabledReason must track the COST
  // pool's remaining count.
  const row: ClassFeatureRow = {
    name: "Test Identity Ability",
    level: 1,
    description: "Feature prose.",
    edition: "EDITION_2024",
    resourceKey: "testIdentity",
    activationCost: "free",
    costKind: "pool",
    costPoolKey: "testPool",
    costBase: 2,
  };

  it("is disabled off the cost pool ('testPool'), never the identity key ('testIdentity')", () => {
    // The identity key has plenty; the COST pool is empty — must be disabled.
    const actions = deriveEntryScopedActions(
      [{ name: "wizard", subclass: undefined, level: 1 }],
      1,
      [
        { key: "testIdentity", remaining: 99 },
        { key: "testPool", remaining: 0 },
      ],
      true,
      "EDITION_2024",
      () => carrierOf([row]),
    );
    const card = actions.find((a) => a.key === "testIdentity");
    expect(card?.enabled).toBe(false);
    expect(card?.disabledReason).toBe("No testPool remaining");
  });

  it("is enabled once the cost pool ('testPool') has enough, regardless of the identity key's own count", () => {
    const actions = deriveEntryScopedActions(
      [{ name: "wizard", subclass: undefined, level: 1 }],
      1,
      [
        { key: "testIdentity", remaining: 0 },
        { key: "testPool", remaining: 2 },
      ],
      true,
      "EDITION_2024",
      () => carrierOf([row]),
    );
    const card = actions.find((a) => a.key === "testIdentity");
    expect(card?.enabled).toBe(true);
  });

  it("requires the full cost base (2), not just 1", () => {
    const actions = deriveEntryScopedActions(
      [{ name: "wizard", subclass: undefined, level: 1 }],
      1,
      [{ key: "testPool", remaining: 1 }],
      true,
      "EDITION_2024",
      () => carrierOf([row]),
    );
    const card = actions.find((a) => a.key === "testIdentity");
    expect(card?.enabled).toBe(false);
    expect(card?.disabledReason).toBe("Need 2 testPool, have 1");
  });
});
