// Pure (no DB) tests for buildAvailableActionsView's two #1435 additions:
// the gated off-hand eligibility row, and the resolved Deflect Attacks /
// Deflect Missiles roll specs attached to the served rows. The deflect roll
// arithmetic itself is pinned in lib/srd/__tests__/deflect.test.ts; here we
// assert the view attaches those specs to the right rows for the right edition.
import { describe, expect, it } from "vitest";

import { buildAvailableActionsView } from "@/lib/character/serialize/classes.js";
import type { CharacterWithRelations } from "@/lib/character/character-include.js";

type ClassEntries = CharacterWithRelations["classEntries"];

// Minimal class entries — featureRowsOf tolerates the absent class/subclassRef
// relations (returns empty rows), so a bare {name, level} suffices for the
// DERIVED_ACTIONS-driven rows this test asserts on.
function entries(list: { name: string; level: number }[]): ClassEntries {
  return list as unknown as ClassEntries;
}

const DEX16 = { dexterity: 16 };

function offHandRow(equipped: { light: boolean }[], scores: Record<string, number> = {}) {
  const actions = buildAvailableActionsView(entries([]), 1, undefined, true, "EDITION_2024", scores, equipped);
  return actions.find((a) => a.key === "offHandAttack");
}

describe("off-hand eligibility row (#1435)", () => {
  it("is enabled for two equipped Light weapons", () => {
    const row = offHandRow([{ light: true }, { light: true }]);
    expect(row?.enabled).toBe(true);
    expect(row?.disabledReason).toBeUndefined();
  });

  it("is disabled with a Light-weapon reason for one weapon + shield (a single equipped weapon)", () => {
    const row = offHandRow([{ light: true }]);
    expect(row?.enabled).toBe(false);
    expect(row?.disabledReason).toMatch(/Light weapons/);
  });

  it("is disabled for a non-Light pair — the Two-Weapon Fighting style never waives the Light requirement (#1496/#1640)", () => {
    const row = offHandRow([{ light: false }, { light: false }]);
    expect(row?.enabled).toBe(false);
    expect(row?.disabledReason).toMatch(/Light weapons/);
  });

  it("is disabled for a MIXED Light/non-Light pair — BOTH weapons must be Light (guards an every→some regression)", () => {
    const row = offHandRow([{ light: true }, { light: false }]);
    expect(row?.enabled).toBe(false);
    expect(row?.disabledReason).toMatch(/Light weapons/);
  });

  it("is served for every character, including a non-combat loadout", () => {
    expect(offHandRow([])?.enabled).toBe(false);
  });
});

describe("Deflect specs attached to the served rows (#1435)", () => {
  it("SRD 5.2: deflectAttacks carries the 1d10 + Dex + monk-level reduction; the redirect carries 2×MA die + Dex", () => {
    const actions = buildAvailableActionsView(entries([{ name: "monk", level: 5 }]), 5, undefined, true, "EDITION_2024", DEX16, []);
    const base = actions.find((a) => a.key === "deflectAttacks");
    const redirect = actions.find((a) => a.key === "deflectAttacksRedirect");
    expect(base?.effect?.dice).toEqual({ count: 1, faces: 10, modifier: 8 });
    expect(redirect?.effect?.dice).toEqual({ count: 2, faces: 8, modifier: 3 });
  });

  it("SRD 5.1: deflectMissiles carries the same reduction; the throw-back carries 1d6 + Dex", () => {
    const actions = buildAvailableActionsView(entries([{ name: "monk", level: 5 }]), 5, undefined, true, "EDITION_2014", DEX16, []);
    const base = actions.find((a) => a.key === "deflectMissiles");
    const throwBack = actions.find((a) => a.key === "deflectMissilesThrow");
    expect(base?.effect?.dice).toEqual({ count: 1, faces: 10, modifier: 8 });
    expect(throwBack?.effect?.dice).toEqual({ count: 1, faces: 6, modifier: 3 });
  });

  it("multiclass unchanged: the reduction scales on the Monk ENTRY level, not the total (Monk 3 / Fighter 10)", () => {
    const actions = buildAvailableActionsView(
      entries([
        { name: "monk", level: 3 },
        { name: "fighter", level: 10 },
      ]),
      13,
      undefined,
      true,
      "EDITION_2024",
      DEX16,
      [],
    );
    // Dex +3 + Monk entry level 3 = 6 (not 3 + 13 = 16).
    expect(actions.find((a) => a.key === "deflectAttacks")?.effect?.dice).toEqual({ count: 1, faces: 10, modifier: 6 });
  });

  it("single-class: the reduction uses the XP-derived level, not a stale entry.level (effectiveEntryLevel)", () => {
    // entry.level lags at 3 while the XP-derived level arg is 5. For a single
    // class, effectiveEntryLevel returns the XP-derived level (the per-entry
    // column self-heals lazily), so the reduction is Dex +3 + 5 = 8, not +3+3.
    const actions = buildAvailableActionsView(entries([{ name: "monk", level: 3 }]), 5, undefined, true, "EDITION_2024", DEX16, []);
    expect(actions.find((a) => a.key === "deflectAttacks")?.effect?.dice).toEqual({ count: 1, faces: 10, modifier: 8 });
  });

  it("attaches no deflect spec for a non-monk (no deflect row exists), but still serves the off-hand row", () => {
    const actions = buildAvailableActionsView(entries([{ name: "fighter", level: 5 }]), 5, undefined, true, "EDITION_2024", DEX16, []);
    expect(actions.some((a) => a.key === "deflectAttacks" || a.key === "deflectMissiles")).toBe(false);
    expect(actions.some((a) => a.key === "offHandAttack")).toBe(true);
  });
});
