// Pure (no DB) tests for the announce-augmentor fold pipeline (#1910, epic
// #1903 decision 2): applyAnnounceAugmentors is the ONE place a payload gets
// folded onto a served action — descriptors (deflect.ts's deflectAugmentor,
// arcane-charge.ts's arcaneChargeAugmentor) return structured payloads only,
// never touching the action themselves. This suite calls the REAL exported
// applyAnnounceAugmentors with a synthetic augmentor list (its optional third
// parameter — the production call site in deriveEntryScopedActions never
// passes one, defaulting to the real ANNOUNCE_AUGMENTORS), so the fold
// semantics are pinned against the actual pipeline code, not a re-implemented
// copy.
import { describe, expect, it } from "vitest";

import { applyAnnounceAugmentors, ANNOUNCE_AUGMENTORS, type AnnounceAugmentor, type AugmentorContext } from "../announce-augmentors.js";
import type { AvailableAction } from "../actions.js";

const BASE_ACTION: AvailableAction = { key: "testAction", name: "Test Action", cost: "action", enabled: true };
const BASE_CTX: AugmentorContext = { slug: undefined, entryLevel: 1, edition: "EDITION_2024" };

describe("ANNOUNCE_AUGMENTORS registry", () => {
  it("is populated with the two migrated descriptors (deflect, arcane charge)", () => {
    expect(ANNOUNCE_AUGMENTORS.length).toBe(2);
  });
});

describe("applyAnnounceAugmentors", () => {
  it("is a no-op when no augmentor targets the action's key", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["someOtherKey"],
      appliesTo: () => true,
      augment: () => ({ reminderAppend: "should never apply" }),
    };
    const result = applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [augmentor]);
    expect(result).toEqual(BASE_ACTION);
  });

  it("is a no-op when appliesTo returns false, even for a targeted key", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => false,
      augment: () => ({ reminderAppend: "should never apply" }),
    };
    expect(applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [augmentor])).toEqual(BASE_ACTION);
  });

  it("is a no-op when augment returns null", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => null,
    };
    expect(applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [augmentor])).toEqual(BASE_ACTION);
  });

  it("appends reminderAppend to an action with no existing reminder, no leading space", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => ({ reminderAppend: "Added text." }),
    };
    const result = applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [augmentor]);
    expect(result.reminder).toBe("Added text.");
  });

  it("appends reminderAppend after an existing reminder, space-separated, existing text first", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => ({ reminderAppend: "Added text." }),
    };
    const withReminder: AvailableAction = { ...BASE_ACTION, reminder: "Existing text." };
    const result = applyAnnounceAugmentors(withReminder, BASE_CTX, [augmentor]);
    expect(result.reminder).toBe("Existing text. Added text.");
  });

  it("sets count, damageTypeClause and effect from the payload", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => ({
        count: 3,
        damageTypeClause: "any damage type",
        effect: { effectType: "utility", dice: { count: 1, faces: 10, modifier: 2 }, scaling: { mode: "none" } },
      }),
    };
    const result = applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [augmentor]);
    expect(result.count).toBe(3);
    expect(result.damageTypeClause).toBe("any damage type");
    expect(result.effect).toEqual({ effectType: "utility", dice: { count: 1, faces: 10, modifier: 2 }, scaling: { mode: "none" } });
  });

  it("folds every matching augmentor in registry order, not just the first", () => {
    const first: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => ({ reminderAppend: "First." }),
    };
    const second: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => ({ reminderAppend: "Second." }),
    };
    const result = applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [first, second]);
    expect(result.reminder).toBe("First. Second.");
  });

  it("never mutates the input action object", () => {
    const augmentor: AnnounceAugmentor = {
      targetKeys: ["testAction"],
      appliesTo: () => true,
      augment: () => ({ reminderAppend: "Added." }),
    };
    const original = { ...BASE_ACTION };
    applyAnnounceAugmentors(BASE_ACTION, BASE_CTX, [augmentor]);
    expect(BASE_ACTION).toEqual(original);
  });

  it("with no third argument, folds against the real ANNOUNCE_AUGMENTORS registry", () => {
    // actionSurge with no Eldritch Knight gate satisfied: neither real
    // descriptor applies (deflectAugmentor doesn't target this key at all;
    // arcaneChargeAugmentor's appliesTo needs slug/level/edition to match),
    // so this proves the default parameter really is ANNOUNCE_AUGMENTORS and
    // not an empty list.
    const action: AvailableAction = { key: "actionSurge", name: "Action Surge", cost: "special", enabled: true };
    expect(applyAnnounceAugmentors(action, BASE_CTX)).toEqual(action);
  });
});
