import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { RollProvider } from "@/features/dice/RollContext";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import type { AttackEntry } from "@/lib/attackMath";
import type { RollResult } from "@/lib/dice";
import type { RollModifier } from "@/types/character";

vi.mock("@/api/client", () => ({ logRoll: vi.fn().mockResolvedValue(undefined) }));

const poisoned: RollModifier[] = [
  { mode: "disadvantage", kind: "attack", source: "Poisoned" },
  { mode: "disadvantage", kind: "check", source: "Poisoned" },
];

const entry: AttackEntry = {
  id: "longsword",
  name: "Longsword",
  attackLabel: "+5",
  damageLabel: "1d8 + 3 slashing",
  attackSpec: { count: 1, faces: 20, modifier: 5 },
  damageSpec: { count: 1, faces: 8, modifier: 3 },
  damageType: "slashing",
  attackRollLabel: "Longsword attack",
  damageRollLabel: "Longsword damage",
  logSource: "Longsword",
  damageRiders: [],
};

function setup(rollModifiers: RollModifier[], manualMode: "normal" | "advantage" | "disadvantage" = "normal") {
  const roll = vi.fn((spec): RollResult => ({ dice: [{ value: 10, dropped: false }], modifier: spec.modifier ?? 0, total: 10, spec }));
  const noop = vi.fn();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RollProvider characterId="c1" sessionId="s1" rollModifiers={rollModifiers}>
      {children}
    </RollProvider>
  );
  const { result } = renderHook(
    () =>
      useAttackRolls({
        roll,
        logRollSafe: noop,
        recordAttack: noop,
        setTallyDamage: noop,
        setTallyAttackTotal: noop,
        addTallyDamageRider: noop,
        currentRow: null,
        manualMode,
      }),
    { wrapper },
  );
  return { result, roll };
}

describe("useAttackRolls state-driven roll mode (#486)", () => {
  it("surfaces a disadvantage chip and pins the mode while Poisoned", () => {
    const { result, roll } = setup(poisoned);
    expect(result.current.viewFor(entry).attackChip).toBe("disadvantage — Poisoned");
    expect(result.current.viewFor(entry).attackMode).toBe("disadvantage");

    result.current.viewFor(entry).onAttack();
    expect(roll.mock.calls[0][0]).toMatchObject({ mode: "disadvantage" });
  });

  it("shows no chip and rolls normally with no state", () => {
    const { result, roll } = setup([]);
    expect(result.current.viewFor(entry).attackChip).toBe("");
    expect(result.current.viewFor(entry).attackMode).toBe("normal");

    result.current.viewFor(entry).onAttack();
    expect(roll.mock.calls[0][0]).toMatchObject({ mode: "normal" });
  });
});

const exhaustion2: RollModifier[] = [
  { mode: "flat", modifier: -4, kind: "attack", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "check", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "save", source: "Exhaustion" },
  { mode: "flat", modifier: -4, kind: "initiative", source: "Exhaustion" },
];

describe("useAttackRolls flat exhaustion penalty (#1136)", () => {
  it("folds the flat penalty into the rolled spec's modifier and surfaces it in the chip", () => {
    const { result, roll } = setup(exhaustion2);
    expect(result.current.viewFor(entry).attackChip).toBe("−4 — Exhaustion");
    expect(result.current.viewFor(entry).attackMode).toBe("normal");

    result.current.viewFor(entry).onAttack();
    // Base attack bonus +5 plus exhaustion −4 → +1 on the wire.
    expect(roll.mock.calls[0][0]).toMatchObject({ modifier: 1, mode: "normal" });
  });

  it("keeps the flat penalty even when a manual advantage is chosen", () => {
    const { result, roll } = setup(exhaustion2, "advantage");
    result.current.viewFor(entry).onAttack();
    expect(roll.mock.calls[0][0]).toMatchObject({ modifier: 1, mode: "advantage" });
  });
});

describe("useAttackRolls manual roll mode (#958)", () => {
  it("applies the sheet's manual advantage and lets it override a state disadvantage", () => {
    // Manual advantage short-circuits the Poisoned disadvantage (resolveRollMode #4).
    const { result, roll } = setup(poisoned, "advantage");
    expect(result.current.viewFor(entry).attackMode).toBe("advantage");

    result.current.viewFor(entry).onAttack();
    expect(roll.mock.calls[0][0]).toMatchObject({ mode: "advantage" });
  });
});
