import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { useTurnState } from "@/features/session/useTurnState";
import { applyResolveActionOperations, logRollAction, castManeuverTransaction } from "@/api/client";
import { getQueryClient } from "@/api/queryClient";
import { characterKeys } from "@/api/queryKeys";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import { IMPROVISED_ROW, UNARMED_ROW, attackRow } from "@/test/attackRowFixtures";
import type { AttackRow } from "@character-sheet/shared-types";
import type { Character } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  applyInventoryTransactions: vi.fn(),
  applySpellcastingTransactions: vi.fn(),
  applyResolveActionOperations: vi.fn(),
  castManeuverTransaction: vi.fn(),
  logRollAction: vi.fn().mockResolvedValue(undefined),
}));

function seedMid() {
  return vi.spyOn(Math, "random").mockReturnValue(0.5);
}
function seedTopFace() {
  return vi.spyOn(Math, "random").mockReturnValue(0.95);
}
function seedNat1() {
  return vi.spyOn(Math, "random").mockReturnValue(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(logRollAction).mockResolvedValue(undefined as never);
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const turnState = {
  attack: { total: 1, used: 0 },
  attackTally: [],
  recordAttack: vi.fn(),
  setTallyDamage: vi.fn(),
  setTallyAttackTotal: vi.fn(),
  setTallyVerdict: vi.fn(),
  addTallyDamageRider: vi.fn(),
  consumeBonusAction: vi.fn(),
  consumeReaction: vi.fn(),
} as unknown as TurnState & TurnStateActions;

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    inventory: [],
    attacksPerAction: 1,
    critRange: 20,
    unarmedStrike: {
      attackBonus: 2,
      damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" },
    },
    improvisedWeapon: {
      attackBonus: 2,
      damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" },
      proficient: false,
    },
    resources: { pools: [] },
    ...overrides,
    attackRows: [...(overrides.attackRows ?? []), UNARMED_ROW, IMPROVISED_ROW],
  } as unknown as Character;
}

interface RenderOpts {
  turnState?: TurnState & TurnStateActions;
  onCancel?: ReturnType<typeof vi.fn>;
  onClose?: ReturnType<typeof vi.fn>;
}

function renderPicker(character: Character, onLogChanged = vi.fn(), opts: RenderOpts = {}) {
  const onCancel = opts.onCancel ?? vi.fn();
  const onClose = opts.onClose ?? vi.fn();
  renderWithCharacter(
    <RollProvider>
      <InlineAttackPicker
        turnState={opts.turnState ?? turnState}
        onClose={onClose}
        onCancel={onCancel}
        onLogChanged={onLogChanged}
      />
    </RollProvider>,
    character,
  );
  return { onCancel, onClose };
}

function weaponRow(name: string, id: string, overrides: Partial<AttackRow> = {}): AttackRow {
  return attackRow({
    id,
    kind: "weapon",
    name,
    grip: "one-handed",
    damageType: "slashing",
    attackSpec: { count: 1, faces: 20, modifier: 3 },
    damageSpec: { count: 1, faces: 8, modifier: 0 },
    ...overrides,
  });
}

describe("InlineAttackPicker — attack form selector (#786)", () => {
  it("renders one segment per distinct equipped weapon plus Unarmed and Improvised", () => {
    renderPicker(
      makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1"), weaponRow("Dagger", "inv-2")] }),
    );
    expect(screen.getByRole("radiogroup", { name: /Attacking with/ })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Longsword" })).toBeInTheDocument();
  });

  it("shows the sheet's own ADV/DIS control and defaults to Normal (#958)", async () => {
    const user = userEvent.setup();
    renderPicker(makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1")] }));
    const mode = screen.getByRole("group", { name: "Attack roll mode" });
    expect(within(mode).getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");
    await user.click(within(mode).getByRole("button", { name: "Advantage" }));
    expect(within(mode).getByRole("button", { name: "Advantage" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows exactly one attack card (one Roll to hit) and one damage card", () => {
    renderPicker(
      makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1"), weaponRow("Dagger", "inv-2")] }),
    );
    expect(screen.getAllByRole("button", { name: /Roll to hit/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Roll damage/ })).toHaveLength(1);
  });

  it("shows the armed form's stats preview and updates it on selection", async () => {
    renderPicker(makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1")] }));
    await userEvent.click(screen.getByRole("radio", { name: "Improvised Weapon" }));
    expect(screen.getByText(/\+2 to hit · 1d4 bludgeoning/)).toBeInTheDocument();
    expect(screen.getByText(/\(no proficiency\)/)).toBeInTheDocument();
  });

  it("keeps a visibly checked form when the selected weapon leaves the inventory", async () => {
    const user = userEvent.setup();
    const shared = { turnState, onClose: vi.fn(), onCancel: vi.fn(), onLogChanged: vi.fn() };
    const initialCharacter = makeCharacter({
      attackRows: [weaponRow("Longsword", "inv-1"), weaponRow("Dagger", "inv-2")],
    });
    const { rerender } = renderWithCharacter(
      <RollProvider>
        <InlineAttackPicker {...shared} />
      </RollProvider>,
      initialCharacter,
    );
    await user.click(screen.getByRole("radio", { name: "Dagger" }));
    getQueryClient().setQueryData(
      characterKeys.detail(initialCharacter.id),
      makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1")] }),
    );
    rerender(
      <RollProvider>
        <InlineAttackPicker {...shared} />
      </RollProvider>,
    );
    const checked = screen.getAllByRole("radio").filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("Longsword");
  });

  it("never surfaces a weapon the server served no row for", () => {
    renderPicker(makeCharacter());
    expect(screen.queryByRole("radio", { name: "Longsword" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("shows the turn-screen empty-state hint when no weapon is equipped", () => {
    renderPicker(makeCharacter());
    expect(screen.getByText(/No weapon equipped/i).textContent).toMatch(/turn screen/i);
  });
});

describe("InlineAttackPicker — live attack counter (#757)", () => {
  const attackState = (total: number, used: number) => ({ ...turnState, attack: { total, used } }) as unknown as TurnState & TurnStateActions;

  function withWeapon(attacksPerAction: number) {
    return makeCharacter({ attacksPerAction, attackRows: [weaponRow("Longsword", "inv-1")] });
  }

  it("renders the live pip counter for a multi-attack action (2 of 2 remaining)", () => {
    renderPicker(withWeapon(2), vi.fn(), { turnState: attackState(2, 0) });
    expect(screen.getByText(/Attacks · 2 of 2 remaining/)).toBeInTheDocument();
  });

  it("disables the single Roll-to-hit button when attacks are exhausted", () => {
    renderPicker(withWeapon(2), vi.fn(), { turnState: attackState(2, 2) });
    expect(screen.getByText(/Attacks · 0 of 2 remaining/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll to hit/ })).toBeDisabled();
  });

  it("hides the pip counter for a single-attack action", () => {
    renderPicker(withWeapon(1), vi.fn(), { turnState: attackState(1, 0) });
    expect(screen.queryByText(/of 1 remaining/)).not.toBeInTheDocument();
  });
});

describe("InlineAttackPicker — footer", () => {
  it("offers Cancel — refund action before any attack is rolled, wired to onCancel", async () => {
    const { onCancel } = renderPicker(makeCharacter());
    await userEvent.click(screen.getByRole("button", { name: /Cancel — refund action/ }));
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("switches to Done once an attack has been rolled", () => {
    const rolledTurnState = { ...turnState, attack: { total: 1, used: 1 } } as unknown as TurnState & TurnStateActions;
    renderPicker(makeCharacter(), vi.fn(), { turnState: rolledTurnState });
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
  });
});

function flameTongueRow(overrides: Partial<AttackRow> = {}): AttackRow {
  return weaponRow("Flame Tongue", "inv-flame", {
    damageRiders: [{ id: "inv-flame:rider:0", spec: { count: 2, faces: 6, modifier: 0 }, damageType: "fire" }],
    ...overrides,
  });
}

describe("InlineAttackPicker — on-hit dice riders (#1843: routed into resolveAction, not logRoll)", () => {
  it("renders a typed rider button after rolling to hit, without touching logRoll", async () => {
    seedMid();
    renderPicker(makeCharacter({ attackRows: [flameTongueRow()] }));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    const riderButton = screen.getByRole("button", { name: /Roll \+2d6 fire/ });
    await userEvent.click(riderButton);

    expect(vi.mocked(logRollAction)).not.toHaveBeenCalled();
  });

  it("hides the rider when the served row carries none", async () => {
    seedMid();
    renderPicker(makeCharacter({ attackRows: [flameTongueRow({ damageRiders: [] })] }));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.queryByRole("button", { name: /Roll \+2d6 fire/ })).not.toBeInTheDocument();
  });

  it("hides the rider once 'it Missed' is called", async () => {
    seedNat1();
    renderPicker(makeCharacter({ attackRows: [flameTongueRow()] }));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.queryByRole("button", { name: /Roll \+2d6 fire/ })).not.toBeInTheDocument();
  });
});

function LiveHarness({ character }: { character: Character }) {
  vi.mocked(applyResolveActionOperations).mockResolvedValue({ character, batchId: "test-batch" });
  const liveTurnState = useTurnState(character, "sess-crit");
  useEffect(() => {
    liveTurnState.startCombat();
    liveTurnState.startTurn();
    liveTurnState.enterAttackMode();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- harness drives into attack mode once on mount; empty deps intentional
  }, []);
  return (
    <RollProvider>
      <InlineAttackPicker
        turnState={liveTurnState}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onLogChanged={vi.fn()}
      />
    </RollProvider>
  );
}

describe("InlineAttackPicker — resolveAction commit (epic #1827 Slice 5, #1832)", () => {
  it("commits a resolveAction op mapping cost.kind action → action, with the echoed source/toHit/effect", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [characterId, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(characterId).toBe("char-1");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({
      type: "resolveAction",
      source: "Longsword",
      cost: { kind: "action", attacks: 1 },
    });
    expect(ops[0].toHit).toMatchObject({ verdict: "hit" });
    expect(ops[0].effect).toMatchObject({ type: "slashing", kind: "damage" });
  });

  it("does not call logRoll for the weapon's own attack/damage rolls (retired for weapons)", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(logRollAction)).not.toHaveBeenCalled();
  });
});

describe("InlineAttackPicker — typed damage riders route into the single resolveAction op (#1843)", () => {
  it("includes the rolled rider in ops[0].riders, alongside the primary effect, and never calls logRoll", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [flameTongueRow()] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].effect).toMatchObject({ type: "slashing", kind: "damage" });
    expect(ops[0].riders).toHaveLength(1);
    expect(ops[0].riders?.[0]).toMatchObject({ type: "fire", kind: "damage", source: "Flame Tongue" });
    expect(vi.mocked(logRollAction)).not.toHaveBeenCalled();
  });

  it("omits riders from the op when none were rolled this swing", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [flameTongueRow()] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].riders ?? []).toHaveLength(0);
  });

  it("does not carry a rider rolled on swing 1 into swing 2's op (Extra Attack)", async () => {
    seedMid();
    const character = makeCharacter({ attacksPerAction: 2, attackRows: [flameTongueRow()] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));

    const [, op2] = vi.mocked(applyResolveActionOperations).mock.calls[1];
    expect(op2[0].riders ?? []).toHaveLength(0);
  });

  it("drops a rolled rider when the swing is ultimately called a miss", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [flameTongueRow()] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));
    await userEvent.click(screen.getByRole("button", { name: /it Missed/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].toHit).toMatchObject({ verdict: "miss" });
    expect(ops[0].riders ?? []).toHaveLength(0);
  });
});

describe("InlineAttackPicker — Sneak Attack rides the swing's resolveAction op (#902 rider migration)", () => {
  function rogueCharacter(overrides: Partial<Character> = {}): Character {
    return makeCharacter({
      sneakAttack: { dice: { count: 1, faces: 6 } },
      attackRows: [weaponRow("Rapier", "inv-rapier", { damageType: "piercing", damageRiders: [] })],
      ...overrides,
    } as Partial<Character>);
  }

  async function rollSneak() {
    await userEvent.click(screen.getByRole("checkbox"));
    await userEvent.click(screen.getByRole("button", { name: /Roll Sneak Attack/ }));
  }

  it("puts the sneak roll into ops[0].riders typed with the weapon's damage type, with no separate log call", async () => {
    seedMid();
    const character = rogueCharacter();
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await rollSneak();
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].effect).toMatchObject({ type: "piercing", kind: "damage" });
    expect(ops[0].riders).toHaveLength(1);
    expect(ops[0].riders?.[0]).toMatchObject({ type: "piercing", kind: "damage", source: "Sneak Attack" });
    expect(vi.mocked(logRollAction)).not.toHaveBeenCalled();
  });

  it("doubles the sneak dice when the hit is already a crit", async () => {
    seedTopFace();
    const character = rogueCharacter();
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await rollSneak();
    await userEvent.click(screen.getByRole("button", { name: /Roll crit damage/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].riders?.[0]).toMatchObject({ crit: true });
    expect(ops[0].riders?.[0].faces).toHaveLength(2);
  });

  it("drops the sneak rider when the swing is ultimately called a miss", async () => {
    seedMid();
    const character = rogueCharacter();
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await rollSneak();
    await userEvent.click(screen.getByRole("button", { name: /it Missed/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].toHit).toMatchObject({ verdict: "miss" });
    expect(ops[0].riders ?? []).toHaveLength(0);
  });

  it("does not carry the sneak rider into swing 2 and shows the once-per-turn guard (Extra Attack)", async () => {
    seedMid();
    const character = rogueCharacter({ attacksPerAction: 2 });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await rollSneak();
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled());
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/Used this turn/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll Sneak Attack/ })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));
    const [, op2] = vi.mocked(applyResolveActionOperations).mock.calls[1];
    expect(op2[0].riders ?? []).toHaveLength(0);
  });

  it("keeps the roll button disabled until eligibility is confirmed", async () => {
    seedMid();
    const character = rogueCharacter();
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByRole("button", { name: /Roll Sneak Attack/ })).toBeDisabled();
  });
});

describe("InlineAttackPicker — Extra Attack loop (#1832)", () => {
  it("drives the rail twice, firing one resolveAction op per swing, and finishes at N of N", async () => {
    seedMid();
    const character = makeCharacter({
      attacksPerAction: 2,
      attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    expect(screen.getByText(/Attacks · 2 of 2 remaining/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByText(/Attacks · 1 of 2 remaining/)).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.getByText(/Attacks · 0 of 2 remaining/)).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Roll to hit/ })).not.toBeInTheDocument();
    const [, op1] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    const [, op2] = vi.mocked(applyResolveActionOperations).mock.calls[1];
    expect(op1[0].actionId).not.toBe(op2[0].actionId);
  });

  it("never over-spends the Action: two swings still leave the turn's other action-cost affordances untouched", async () => {
    seedMid();
    const character = makeCharacter({
      attacksPerAction: 2,
      attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })],
    });
    function Harness() {
      vi.mocked(applyResolveActionOperations).mockResolvedValue({ character, batchId: "test-batch" });
      const live = useTurnState(character, "sess-spend");
      useEffect(() => {
        live.startCombat();
        live.startTurn();
        live.enterAttackMode();
        // eslint-disable-next-line react-hooks/exhaustive-deps -- one-time setup
      }, []);
      return (
        <>
          <span data-testid="actions-remaining">{live.actionsRemaining}</span>
          <RollProvider>
            <InlineAttackPicker
              turnState={live}
              onClose={vi.fn()}
              onCancel={vi.fn()}
              onLogChanged={vi.fn()}
            />
          </RollProvider>
        </>
      );
    }
    renderWithCharacter(<Harness />, character);

    expect(screen.getByTestId("actions-remaining")).toHaveTextContent("0");

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));

    expect(screen.getByTestId("actions-remaining")).toHaveTextContent("0");
  });
});

describe("InlineAttackPicker — deferred swing tally on resolveAction reject (#1857)", () => {
  it("does not advance the swing count and surfaces the error + a retry affordance when resolveAction rejects", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    vi.mocked(applyResolveActionOperations).mockRejectedValueOnce(new Error("network blip"));
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    await screen.findByText("network blip");

    expect(await screen.findByRole("button", { name: /Roll to hit/ })).not.toBeDisabled();
  });

  it("does not auto-advance to swing 2 of an Extra Attack sequence when swing 1's resolveAction rejects", async () => {
    seedMid();
    const character = makeCharacter({
      attacksPerAction: 2,
      attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })],
    });
    vi.mocked(applyResolveActionOperations).mockRejectedValueOnce(new Error("network blip"));
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    await screen.findByText("network blip");

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));

    await waitFor(() => expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled());
    expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2);
  });
});

describe("InlineAttackPicker — crit-upgrade guard (#1831 review NICE)", () => {
  it("a 'Crit!' tap AFTER damage is already rolled does not flag effect.crit or change the total", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    expect(screen.getByText("✓ Hit")).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Crit!$/ }));

    const done = screen.getByRole("button", { name: /^Done$/ });
    await userEvent.click(done);

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].effect?.crit).toBe(false);
    expect(ops[0].effect?.faces).toHaveLength(1);
  });

  it("calling Crit! BEFORE damage still doubles the dice normally", async () => {
    seedMid();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Crit!$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll crit damage/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].effect?.crit).toBe(true);
    expect(ops[0].effect?.faces).toHaveLength(2);
  });
});

describe("InlineAttackPicker — auto-crit on a natural 20 (#766)", () => {
  it("shows 'Critical hit!' and rolls doubled damage after a nat-20 to-hit", async () => {
    seedTopFace();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/Critical hit! — nat/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Roll crit damage/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].toHit).toMatchObject({ nat20: true, verdict: "crit" });
    expect(ops[0].effect).toMatchObject({ crit: true });
  });

  it("shows a Miss indicator on a natural 1 and Done commits a miss with no effect roll needed", async () => {
    seedNat1();
    const character = makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })] });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/Miss — nat 1/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].toHit).toMatchObject({ verdict: "miss" });
    expect(ops[0].effect).toBeNull();
  });
});

describe("InlineAttackPicker — 'it Missed' re-arms the next attack (#811)", () => {
  it("resets the rail and advances the Extra Attack counter on a called miss", async () => {
    seedMid();
    const character = makeCharacter({
      attacksPerAction: 2,
      attackRows: [weaponRow("Longsword", "inv-1", { damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /it Missed/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Attacks · 1 of 2 remaining/)).toBeInTheDocument());
  });
});

describe("InlineAttackPicker — Precision Attack under the attack card (#809, boost logged #1844)", () => {
  const SERVER_ROLL = 5;

  function battleMaster(maneuversKnown: Array<Record<string, unknown>>): Character {
    return makeCharacter({
      attackRows: [
        weaponRow("Longsword", "inv-1", {
          damageType: "slashing",
          attackSpec: { count: 1, faces: 20, modifier: 5 },
          damageSpec: { count: 1, faces: 8, modifier: 0 },
          damageRiders: [],
        }),
      ],
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown,
      },
    } as unknown as Character);
  }

  const PRECISION = { id: "m-precision", name: "Precision Attack", description: "Add to the attack roll.", placement: "attackRoll" };
  const TRIP = { id: "m-trip", name: "Trip Attack", description: "Add to the damage roll.", placement: "damageRoll" };

  it("spending Precision after a to-hit boosts the result line and the tally row", async () => {
    const user = userEvent.setup();
    seedMid();
    vi.mocked(castManeuverTransaction).mockResolvedValue({
      character: battleMaster([PRECISION]),
      results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Precision Attack" }],
    } as unknown as Awaited<ReturnType<typeof castManeuverTransaction>>);

    const character = battleMaster([PRECISION]);
    renderWithCharacter(<LiveHarness character={character} />, character);

    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getAllByText("16").length).toBeGreaterThanOrEqual(1);

    await user.click(screen.getByRole("button", { name: /Battle Master maneuvers/ }));
    await user.click(screen.getByRole("button", { name: /Precision Attack/ }));

    await waitFor(() => expect(screen.getAllByText("21").length).toBeGreaterThanOrEqual(1));
  });

  it("logs the Precision boost in the committed op's toHit total, not just the tally (#1844)", async () => {
    const user = userEvent.setup();
    seedMid();
    vi.mocked(castManeuverTransaction).mockResolvedValue({
      character: battleMaster([PRECISION]),
      results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Precision Attack" }],
    } as unknown as Awaited<ReturnType<typeof castManeuverTransaction>>);

    const character = battleMaster([PRECISION]);
    renderWithCharacter(<LiveHarness character={character} />, character);

    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await user.click(screen.getByRole("button", { name: /Battle Master maneuvers/ }));
    await user.click(screen.getByRole("button", { name: /Precision Attack/ }));
    await waitFor(() => expect(screen.getAllByText("21").length).toBeGreaterThanOrEqual(1));

    await user.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await user.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].toHit).toMatchObject({ kept: 11, bonus: 10, total: 21 });
  });

  it("logs a damage maneuver's die as a rider on the committed op (#1844)", async () => {
    const user = userEvent.setup();
    seedMid();
    vi.mocked(castManeuverTransaction).mockResolvedValue({
      character: battleMaster([TRIP]),
      results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Trip Attack" }],
    } as unknown as Awaited<ReturnType<typeof castManeuverTransaction>>);

    const character = battleMaster([TRIP]);
    renderWithCharacter(<LiveHarness character={character} />, character);

    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await user.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await user.click(screen.getByRole("button", { name: /Battle Master maneuvers/ }));
    await user.click(screen.getByRole("button", { name: /Trip Attack/ }));
    await waitFor(() => expect(vi.mocked(castManeuverTransaction)).toHaveBeenCalled());

    await user.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].riders).toHaveLength(1);
    expect(ops[0].riders?.[0]).toMatchObject({ type: "slashing", kind: "damage", total: SERVER_ROLL });
  });
});

describe("InlineAttackPicker — Assassinate toggle (2014 Assassin L3+, #1526)", () => {
  it("shows the toggle for a 2014 Assassin L3+ character (character.assassinate present)", () => {
    renderPicker(makeCharacter({ assassinate: true, attackRows: [weaponRow("Dagger", "inv-1")] }));
    expect(screen.getByLabelText(/target is surprised/i)).toBeInTheDocument();
  });

  it("shows no toggle when character.assassinate is absent (2024 Assassin / sub-L3 / non-Assassin rogue)", () => {
    renderPicker(makeCharacter({ assassinate: undefined, attackRows: [weaponRow("Dagger", "inv-1")] }));
    expect(screen.queryByLabelText(/target is surprised/i)).not.toBeInTheDocument();
  });

  it("toggling surprised converts this swing's hit to a crit, attributed on the committed op — a later non-toggled swing stays normal", async () => {
    seedMid();
    const character = makeCharacter({
      assassinate: true,
      attacksPerAction: 2,
      attackRows: [weaponRow("Dagger", "inv-1", { damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByLabelText(/target is surprised/i));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await waitFor(() => expect(screen.getByText(/^Crit!$/)).toBeInTheDocument());

    await userEvent.click(screen.getByRole("button", { name: /^Roll crit damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, firstOps] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(firstOps[0]).toMatchObject({ assassinate: true });
    expect(firstOps[0].toHit).toMatchObject({ verdict: "crit" });
    expect(firstOps[0].effect?.crit).toBe(true);

    await waitFor(() => expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled());
    expect(screen.getByLabelText(/target is surprised/i)).not.toBeChecked();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(2));
    const [, secondOps] = vi.mocked(applyResolveActionOperations).mock.calls[1];
    expect(secondOps[0].assassinate).toBeFalsy();
    expect(secondOps[0].toHit).toMatchObject({ verdict: "hit" });
    expect(secondOps[0].effect?.crit).toBe(false);
  });

  it("does not force a crit on a natural 1 — surprise cannot upgrade an auto-miss", async () => {
    seedNat1();
    const character = makeCharacter({
      assassinate: true,
      attackRows: [weaponRow("Dagger", "inv-1", { damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByLabelText(/target is surprised/i));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await waitFor(() => expect(screen.getByText(/Miss — nat 1/)).toBeInTheDocument());
    expect(screen.getByLabelText(/target is surprised/i)).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(ops[0].toHit).toMatchObject({ verdict: "miss" });
    expect(ops[0].assassinate).toBeFalsy();
  });
});
