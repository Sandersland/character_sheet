// Seed-vs-dispatch parity for the actions/transactions endpoint. applyActionOpInTx resolves an
// incoming actionKey two ways: ACTION_EFFECT_FN[key] first, then a ClassFeature row whose own
// resourceKey (or, for a "toggle" row, endActionKey(resourceKey)) equals key — see
// eligibleRowActions. A universal Action row or a DERIVED_ACTIONS entry has no row to fall back
// to, so a key missing from ACTION_EFFECT_FN there is the runtime UnknownActionError -> 400.
//
// ACTION_EFFECT_FN is checked BEFORE eligibleRowActions, so an entry there silently shadows the
// row path — skipping its level/edition gate, assertActivationRequirementsMet, and any
// server-rolled dice — for whichever key gets the entry. This test cannot tell a legitimately
// dual-homed key (one whose row can't express a client-rolled heal or an edition-forked pool key
// generically) apart from a careless re-add; ROW_ONLY_ACTION_KEYS pins the keys with no legitimate
// reason to ever be dual-homed.
//
// Lives prisma-side (not src/) because it imports CLASS_FEATURES/ACTIONS — a src file importing
// anything under prisma/ is a TS6059 compile error (rootDir "src"); prisma files may import src.
import { describe, expect, it } from "vitest";

import { ACTION_EFFECT_FN, DERIVED_ACTIONS, NO_DISPATCH_ACTION_KEYS, endActionKey } from "@/lib/classes/actions.js";

import { ACTIONS } from "../actions.js";
import { CLASS_FEATURES } from "../class-features.js";

const UNIVERSAL_ACTION_KEYS = new Set(ACTIONS.filter((row) => row.universal).map((row) => row.key));
const DERIVED_ACTION_KEYS = new Set(DERIVED_ACTIONS.map((row) => row.key));

// A row that isn't BOTH activationCost- and resourceKey-populated never becomes an eligible row
// action — this must stay identical to rowIsAnAvailableAction (lib/classes/actions.ts) and
// eligibleRowActions' own gate (routes/character/actions.ts) — update all three together, or this
// set over- or under-claims reachability for a row that couldn't (or could) actually dispatch.
const CLASS_FEATURE_ROW_KEYS = new Set<string>();
for (const row of CLASS_FEATURES) {
  if (!row.activationCost || !row.resourceKey) continue;
  CLASS_FEATURE_ROW_KEYS.add(row.resourceKey);
  if (row.resolverKind === "toggle") {
    CLASS_FEATURE_ROW_KEYS.add(endActionKey(row.resourceKey));
  }
}

// Every identity the dispatcher could ever be asked to resolve with NO ClassFeature-row fallback
// available — a universal Action row (served to every character of its edition) or a
// DERIVED_ACTIONS entry (summonBondedWeapon, the one permanent TS holdout).
const KEYS_NEEDING_A_HANDLER = new Set([...UNIVERSAL_ACTION_KEYS, ...DERIVED_ACTION_KEYS]);

function isReachableFromSeed(key: string): boolean {
  return UNIVERSAL_ACTION_KEYS.has(key) || DERIVED_ACTION_KEYS.has(key) || CLASS_FEATURE_ROW_KEYS.has(key);
}

describe("ACTION_EFFECT_FN <-> seed parity", () => {
  it("every universal Action row / DERIVED_ACTIONS entry resolves to ACTION_EFFECT_FN or the documented no-dispatch allowlist", () => {
    const gaps = [...KEYS_NEEDING_A_HANDLER].filter(
      (key) => !ACTION_EFFECT_FN[key] && !NO_DISPATCH_ACTION_KEYS.includes(key),
    );
    expect(gaps).toEqual([]);
  });

  it("every ACTION_EFFECT_FN key is reachable from a seeded universal Action row, a ClassFeature row's own resourceKey/toggle-end key, or the DERIVED_ACTIONS holdout", () => {
    const stale = Object.keys(ACTION_EFFECT_FN).filter((key) => !isReachableFromSeed(key));
    expect(stale).toEqual([]);
  });

  it("NO_DISPATCH_ACTION_KEYS itself stays real — every entry actually names a seeded universal or DERIVED_ACTIONS key, never a typo nobody serves", () => {
    const orphaned = NO_DISPATCH_ACTION_KEYS.filter((key) => !KEYS_NEEDING_A_HANDLER.has(key));
    expect(orphaned).toEqual([]);
  });
});
