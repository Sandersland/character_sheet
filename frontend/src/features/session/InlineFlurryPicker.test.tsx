import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineFlurryPicker from "@/features/session/InlineFlurryPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { logRoll } from "@/api/client";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  logRoll: vi.fn().mockResolvedValue(undefined),
  castManeuverTransaction: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeTurnState(bonusAttack: { total: number; used: number } | null) {
  return {
    bonusAttack,
    bonusActionUsed: true,
    attackTally: [],
    recordFlurryAttack: vi.fn(),
    cancelFlurry: vi.fn(),
    finishFlurry: vi.fn(),
    setTallyDamage: vi.fn(),
    setTallyAttackTotal: vi.fn(),
    addTallyDamageRider: vi.fn(),
    setTallyVerdict: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

// A monk with an equipped weapon — Flurry must never offer it as a form.
function monkCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    inventory: [
      {
        id: "inv-1",
        name: "Shortsword",
        category: "weapon" as const,
        quantity: 1,
        equipped: true,
        equippedSlot: "MAIN_HAND",
        weapon: {
          damageDiceCount: 1,
          damageDiceFaces: 6,
          damageModifier: 3,
          damageType: "slashing",
          light: true,
          attackBonus: 5,
        },
      },
    ],
    attacksPerAction: 1,
    unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 6, modifier: 3, damageType: "bludgeoning" } },
    improvisedWeapon: { attackBonus: 2, damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" }, proficient: false },
    resources: { pools: [] },
    advancements: [],
    ...overrides,
  } as unknown as Character;
}

function renderPicker(
  character: Character,
  turnState: TurnState & TurnStateActions,
  handlers: Partial<{ onClose: () => void; onCancel: () => void; onCommitFocusSpend: () => void }> = {},
) {
  return render(
    <RollProvider>
      <InlineFlurryPicker
        character={character}
        turnState={turnState}
        sessionId="sess-1"
        onClose={handlers.onClose ?? vi.fn()}
        onCancel={handlers.onCancel ?? vi.fn()}
        onUpdate={vi.fn()}
        onLogChanged={vi.fn()}
        onCommitFocusSpend={handlers.onCommitFocusSpend ?? vi.fn()}
      />
    </RollProvider>,
  );
}

describe("InlineFlurryPicker (#1217)", () => {
  it("resolves Unarmed Strike only — no weapon form selector even with a weapon equipped", () => {
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }));
    expect(screen.getByText("Unarmed Strike")).toBeInTheDocument();
    expect(screen.queryByText("Shortsword")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("shows the 2-strike counter, not a 1-attack header", () => {
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }));
    expect(screen.getByText(/2 of 2 remaining/)).toBeInTheDocument();
  });

  it("records a bonusAction-source Unarmed Strike roll via recordFlurryAttack", async () => {
    const turnState = makeTurnState({ total: 2, used: 0 });
    renderPicker(monkCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordFlurryAttack).toHaveBeenCalledOnce();
    expect(turnState.recordFlurryAttack).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bonusAction", formName: "Unarmed Strike" }),
    );
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "attack", source: "Unarmed Strike" }),
    );
  });

  it("shows Cancel — refund bonus action before any strike is rolled", () => {
    const onCancel = vi.fn();
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }), { onCancel });
    expect(screen.getByRole("button", { name: /Cancel — refund bonus action/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  // Review finding (#1256): opening the sheet must not spend Focus — only a
  // rolled strike commits it. Otherwise "Cancel — refund bonus action" would
  // lie: the bonus action comes back, but an already-spent Focus Point can't.
  it("cancelling before any strike is rolled spends no Focus", async () => {
    const onCancel = vi.fn();
    const onCommitFocusSpend = vi.fn();
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }), { onCancel, onCommitFocusSpend });

    await userEvent.click(screen.getByRole("button", { name: /Cancel — refund bonus action/ }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommitFocusSpend).not.toHaveBeenCalled();
  });

  it("spends Focus exactly once across a full 2-strike flurry — not per strike", async () => {
    const turnState = makeTurnState({ total: 2, used: 0 });
    const onCommitFocusSpend = vi.fn();
    renderPicker(monkCharacter(), turnState, { onCommitFocusSpend });

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(onCommitFocusSpend).toHaveBeenCalledOnce();

    // Re-arm (Next — the mocked recordFlurryAttack never actually decrements
    // the static `used` prop, so Roll to hit reappears for the 2nd strike).
    await userEvent.click(screen.getByRole("button", { name: /^Next$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordFlurryAttack).toHaveBeenCalledTimes(2);
    expect(onCommitFocusSpend).toHaveBeenCalledOnce();
  });

  it("shows Close (not Done) after one of two strikes — the second is still pending", () => {
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 1 }));
    expect(screen.getByRole("button", { name: /^Close$/ })).toBeInTheDocument();
  });

  it("shows Done and disables Roll to hit once both strikes are spent", () => {
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 2 }));
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll to hit/ })).toBeDisabled();
  });

  it("offers the Battle Master maneuvers disclosure on a flurry strike (multiclass RAW)", () => {
    const bm = monkCharacter({
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown: [],
      },
    } as unknown as Partial<Character>);
    renderPicker(bm, makeTurnState({ total: 2, used: 0 }));
    expect(screen.getByRole("button", { name: /Battle Master maneuvers/ })).toBeInTheDocument();
  });
});
