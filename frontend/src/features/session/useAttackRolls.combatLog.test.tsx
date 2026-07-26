// #1235: the attack sheet must thread the combat-log decomposition fields
// (swingId, verdict, nat20/nat1/crit, structured mode sources, decomposed
// components) onto the roll events it logs — this is the data contract the
// combat-log UI slice (#1237) is built against.
import type { ReactNode } from "react";
import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

import { RollProvider } from "@/features/dice/RollContext";
import { useAttackRolls } from "@/features/session/useAttackRolls";
import type { AttackTallyRow } from "@/lib/attackTallySummary";
import type { AttackEntry } from "@/lib/attackMath";
import type { RollResult } from "@/lib/dice";

vi.mock("@/api/client", () => ({ logRoll: vi.fn().mockResolvedValue(undefined) }));

const longsword: AttackEntry = {
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
  attackComponents: { abilityMod: 3, proficiencyBonus: 2, rangedBonus: 0, attackRollBonus: 0 },
  damageComponents: { abilityMod: 3, meleeDamageBonus: 0 },
};

const dagger: AttackEntry = { ...longsword, id: "dagger", name: "Dagger", logSource: "Dagger" };

// die value drives whether a d20 roll comes back nat20/nat1/neither; damage
// rolls (faces !== 20) always report `die` as their kept value.
function rollReturning(die: number) {
  return vi.fn((spec): RollResult => ({ dice: [{ value: die, dropped: false }], modifier: spec.modifier ?? 0, total: die + (spec.modifier ?? 0), spec }));
}

function setup(
  roll: ReturnType<typeof rollReturning>,
  logRollSafe = vi.fn(),
  currentRow: AttackTallyRow | null = null,
) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <RollProvider characterId="c1" sessionId="s1" rollModifiers={[]}>
      {children}
    </RollProvider>
  );
  const { result } = renderHook(
    () =>
      useAttackRolls({
        roll,
        logRollSafe,
        recordAttack: vi.fn(),
        setTallyDamage: vi.fn(),
        setTallyAttackTotal: vi.fn(),
        addTallyDamageRider: vi.fn(),
        currentRow,
      }),
    { wrapper },
  );
  return { result, logRollSafe };
}

describe("useAttackRolls — #1235 combat-log fields on the attack event", () => {
  it("threads nat20/crit/verdict=crit for a natural 20", () => {
    const { result, logRollSafe } = setup(rollReturning(20));
    result.current.viewFor(longsword).onAttack();

    expect(logRollSafe).toHaveBeenCalledTimes(1);
    const [, , , , , extra] = logRollSafe.mock.calls[0];
    expect(extra).toMatchObject({ nat20: true, nat1: false, crit: true, verdict: "crit" });
  });

  it("threads nat1/verdict=miss for a natural 1", () => {
    const { result, logRollSafe } = setup(rollReturning(1));
    result.current.viewFor(longsword).onAttack();

    const [, , , , , extra] = logRollSafe.mock.calls[0];
    expect(extra).toMatchObject({ nat20: false, nat1: true, crit: false, verdict: "miss" });
  });

  it("leaves verdict undefined for a roll that isn't nat20/nat1 (unresolved until 'Call it')", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();

    const [, , , , , extra] = logRollSafe.mock.calls[0];
    expect(extra.nat20).toBe(false);
    expect(extra.nat1).toBe(false);
    expect(extra.crit).toBe(false);
    expect(extra.verdict).toBeUndefined();
  });

  it("forwards the entry's decomposed attackComponents on the attack roll", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();

    const [, , , , , extra] = logRollSafe.mock.calls[0];
    expect(extra.attackComponents).toEqual(longsword.attackComponents);
  });

  it("always includes a swingId string on the attack roll", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();

    const [, , , , , extra] = logRollSafe.mock.calls[0];
    expect(typeof extra.swingId).toBe("string");
    expect(extra.swingId.length).toBeGreaterThan(0);
  });

  it("shares one swingId between an entry's attack roll and its damage roll", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();
    result.current.viewFor(longsword).onDamage();

    expect(logRollSafe).toHaveBeenCalledTimes(2);
    const attackExtra = logRollSafe.mock.calls[0][5];
    const damageExtra = logRollSafe.mock.calls[1][5];
    expect(damageExtra.swingId).toBe(attackExtra.swingId);
  });

  it("forwards damageComponents on the damage roll", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();
    result.current.viewFor(longsword).onDamage();

    const damageExtra = logRollSafe.mock.calls[1][5];
    expect(damageExtra.damageComponents).toEqual(longsword.damageComponents);
  });

  it("carries verdict='hit' on the damage roll when the tally row's verdict is unset (#1235 implicit hit)", () => {
    const row: AttackTallyRow = {
      id: "row-1",
      source: "action",
      formId: longsword.id,
      formName: longsword.name,
      attack: { total: 15, keptFace: 12, nat20: false, nat1: false },
    };
    const { result, logRollSafe } = setup(rollReturning(10), vi.fn(), row);
    result.current.viewFor(longsword).onDamage();

    const damageExtra = logRollSafe.mock.calls[0][5];
    expect(damageExtra.verdict).toBe("hit");
  });

  it("carries the tally row's own verdict on the damage roll when one was already set", () => {
    const row: AttackTallyRow = {
      id: "row-1",
      source: "action",
      formId: longsword.id,
      formName: longsword.name,
      attack: { total: 20, keptFace: 20, nat20: true, nat1: false },
      verdict: "crit",
    };
    const { result, logRollSafe } = setup(rollReturning(10), vi.fn(), row);
    result.current.viewFor(longsword).onDamage();

    const damageExtra = logRollSafe.mock.calls[0][5];
    expect(damageExtra.verdict).toBe("crit");
    expect(damageExtra.crit).toBe(true);
  });

  it("gives two different entries' swings distinct swingIds", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();
    result.current.viewFor(dagger).onAttack();

    const swingA = logRollSafe.mock.calls[0][5].swingId;
    const swingB = logRollSafe.mock.calls[1][5].swingId;
    expect(swingA).not.toBe(swingB);
  });

  it("a second swing on the SAME entry gets a fresh swingId, not the stale one", () => {
    const { result, logRollSafe } = setup(rollReturning(10));
    result.current.viewFor(longsword).onAttack();
    result.current.viewFor(longsword).onAttack();

    const first = logRollSafe.mock.calls[0][5].swingId;
    const second = logRollSafe.mock.calls[1][5].swingId;
    expect(first).not.toBe(second);
  });
});
