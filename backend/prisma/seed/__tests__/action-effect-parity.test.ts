// Seed-vs-dispatch parity for the actions/transactions endpoint (routes/character/actions.ts).
// applyActionOpInTx resolves an incoming actionKey two ways: ACTION_EFFECT_FN[key] first,
// then a ClassFeature row whose own resourceKey (or, for a "toggle" row, endActionKey(resourceKey))
// equals key — see eligibleRowActions. A universal Action row or a DERIVED_ACTIONS entry has no
// row to fall back to, so a key missing from ACTION_EFFECT_FN there is the runtime
// UnknownActionError -> 400 that actions.ts's own module doc warns about. This test's reachability
// check replaces most of the ~23 hand-maintained `ACTION_EFFECT_FN.someKey).toBeUndefined()` pins
// that used to guard specific cases — 6 survive as ROW_ONLY_ACTION_KEYS, for keys with no
// legitimate reason to ever be dual-homed.
//
// Lives prisma-side (not src/) because it imports CLASS_FEATURES/ACTIONS — a src file importing
// anything under prisma/ is a TS6059 compile error (rootDir "src"); prisma files may import src.
//
// "Reachable" (the reverse direction below) is not the same claim as "safe to duplicate": 20 of
// today's ACTION_EFFECT_FN keys are ALSO a ClassFeature row's own resourceKey, legitimately, because
// their row can't express a client-rolled heal or an edition-forked pool key generically — for those,
// an entry here is correct, not stale. This test structurally cannot tell "legitimately dual-homed"
// apart from "an entry was carelessly re-added for a key the row path already owns", because
// ACTION_EFFECT_FN is checked BEFORE eligibleRowActions (applyActionOpInTx) and would silently shadow
// the row — skipping its level/edition gate, assertActivationRequirementsMet, and any server-rolled
// dice — for whichever key gets the entry. ROW_ONLY_ACTION_KEYS' own "row-only action keys" block
// pins the handful of keys with no legitimate reason to ever be dual-homed.
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
