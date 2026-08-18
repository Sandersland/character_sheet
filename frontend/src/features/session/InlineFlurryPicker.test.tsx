import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineFlurryPicker from "@/features/session/InlineFlurryPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { useTurnState } from "@/features/session/useTurnState";
import { applyResolveActionOperations, logRollAction } from "@/api/client";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import { IMPROVISED_ROW, UNARMED_ROW, attackRow } from "@/test/attackRowFixtures";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  applyResolveActionOperations: vi.fn(),
  castManeuverTransaction: vi.fn(),
  logRollAction: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function seedMid() {
  return vi.spyOn(Math, "random").mockReturnValue(0.5);
}

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
    critRange: 20,
    unarmedStrike: { attackBonus: 6, damage: { count: 1, faces: 6, modifier: 3, damageType: "bludgeoning" } },
    improvisedWeapon: { attackBonus: 2, damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" }, proficient: false },
    resources: { pools: [] },
    advancements: [],
    // The Shortsword's served row is present and must still never be offered.
    attackRows: [
      attackRow({
        id: "inv-1",
        kind: "weapon",
        name: "Shortsword",
        grip: "one-handed",
        damageType: "slashing",
        attackSpec: { count: 1, faces: 20, modifier: 5 },
        damageSpec: { count: 1, faces: 6, modifier: 3 },
      }),
      { ...UNARMED_ROW, attackSpec: { count: 1, faces: 20, modifier: 6 }, damageSpec: { count: 1, faces: 6, modifier: 3 } },
      IMPROVISED_ROW,
    ],
    availableActions: [{ key: "flurryOfBlows", name: "Flurry of Blows", count: 2 }] as unknown as Character["availableActions"],
    ...overrides,
  } as unknown as Character;
}

function renderPicker(
  character: Character,
  turnState: TurnState & TurnStateActions,
  handlers: Partial<{ onClose: () => void; onCancel: () => void; onCommitFocusSpend: () => void }> = {},
) {
  return renderWithCharacter(
    <RollProvider>
      <InlineFlurryPicker
        turnState={turnState}
        onClose={handlers.onClose ?? vi.fn()}
        onCancel={handlers.onCancel ?? vi.fn()}
        onLogChanged={vi.fn()}
        onCommitFocusSpend={handlers.onCommitFocusSpend ?? vi.fn()}
      />
    </RollProvider>,
    character,
  );
}

describe("InlineFlurryPicker (#1217, rewired onto the shared resolver #1845)", () => {
  it("resolves Unarmed Strike only — no weapon form selector even with a weapon equipped", () => {
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }));
    expect(screen.getAllByText("Unarmed Strike").length).toBeGreaterThan(0);
    expect(screen.queryByText("Shortsword")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("shows the 2-strike counter, not a 1-attack header", () => {
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }));
    expect(screen.getByText(/2 of 2 remaining/)).toBeInTheDocument();
  });

  it("records a bonusAction-source Unarmed Strike roll via recordFlurryAttack", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 2, used: 0 });
    renderPicker(monkCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordFlurryAttack).toHaveBeenCalledOnce();
    expect(turnState.recordFlurryAttack).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bonusAction", formName: "Unarmed Strike" }),
    );
  });

  it("never calls logRoll for a strike's attack/damage rolls (retired #1845)", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 2, used: 0 });
    vi.mocked(applyResolveActionOperations).mockResolvedValue({ character: monkCharacter(), batchId: "test-batch" });
    renderPicker(monkCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(logRollAction)).not.toHaveBeenCalled();
  });

  it("shows Cancel — refund bonus action before any strike is rolled", () => {
    const onCancel = vi.fn();
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }), { onCancel });
    expect(screen.getByRole("button", { name: /Cancel — refund bonus action/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("cancelling before any strike is rolled spends no Focus", async () => {
    const onCancel = vi.fn();
    const onCommitFocusSpend = vi.fn();
    renderPicker(monkCharacter(), makeTurnState({ total: 2, used: 0 }), { onCancel, onCommitFocusSpend });

    await userEvent.click(screen.getByRole("button", { name: /Cancel — refund bonus action/ }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(onCommitFocusSpend).not.toHaveBeenCalled();
  });

  it("spends Focus exactly once across a full 2-strike flurry — not per strike", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 2, used: 0 });
    const onCommitFocusSpend = vi.fn();
    vi.mocked(applyResolveActionOperations).mockResolvedValue({ character: monkCharacter(), batchId: "test-batch" });
    renderPicker(monkCharacter(), turnState, { onCommitFocusSpend });

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(onCommitFocusSpend).toHaveBeenCalledOnce();

    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

    // Strike 2 — the rail re-arms itself (mirrors InlineAttackPicker's Extra
    // Attack loop) since a strike remains.
    await waitFor(() => expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordFlurryAttack).toHaveBeenCalledTimes(2);
    expect(onCommitFocusSpend).toHaveBeenCalledOnce();
  });

  it("shows Close (not Done) after one of two strikes commits — the second is still pending", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 2, used: 0 });
    vi.mocked(applyResolveActionOperations).mockResolvedValue({ character: monkCharacter(), batchId: "test-batch" });
    renderPicker(monkCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

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

function LiveHarness({ character }: { character: Character }) {
  vi.mocked(applyResolveActionOperations).mockResolvedValue({ character, batchId: "test-batch" });
  const liveTurnState = useTurnState(character, "sess-flurry");
  useEffect(() => {
    liveTurnState.startCombat();
    liveTurnState.startTurn();
    liveTurnState.consumeBonusAction();
    liveTurnState.enterFlurryMode(2);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- harness drives into flurry mode once on mount; empty deps intentional
  }, []);
  return (
    <RollProvider>
      <InlineFlurryPicker
        turnState={liveTurnState}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onLogChanged={vi.fn()}
        onCommitFocusSpend={vi.fn()}
      />
    </RollProvider>
  );
}

describe("InlineFlurryPicker — resolveAction commit + strike loop (live turnState, #1845)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // useTurnState persists to localStorage keyed by sessionId — clear so a
    // prior test's economy never rehydrates into the next one.
    window.localStorage.clear();
  });

  it("commits one resolveAction op per strike, cost.kind bonus, and finishes at 2 of 2", async () => {
    seedMid();
    const character = monkCharacter();
    renderWithCharacter(<LiveHarness character={character} />, character);

    expect(screen.getByText(/2 of 2 remaining/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

    const [, ops1] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops1[0]).toMatchObject({ type: "resolveAction", source: "Unarmed Strike", cost: { kind: "bonus" } });

    await waitFor(() => expect(screen.getByText(/1 of 2 remaining/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.getByText(/0 of 2 remaining/)).toBeInTheDocument());
  });
});
