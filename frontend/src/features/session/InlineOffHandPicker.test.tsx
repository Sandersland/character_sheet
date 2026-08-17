import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineOffHandPicker from "@/features/session/InlineOffHandPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { applyResolveActionOperations, logRollAction } from "@/api/client";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import { IMPROVISED_ROW, UNARMED_ROW, attackRow } from "@/test/attackRowFixtures";
import type { AttackRow } from "@character-sheet/shared-types";
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
    recordTwfAttack: vi.fn(),
    cancelTwf: vi.fn(),
    setTallyDamage: vi.fn(),
    setTallyAttackTotal: vi.fn(),
    addTallyDamageRider: vi.fn(),
    setTallyVerdict: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

// The off-hand row the server would serve for the dagger below. `damageModifier`
// is the number the server already resolved (#1434) — this sheet does no
// subtraction of its own, so a test about the Two-Weapon Fighting style states the
// modifier the style would have preserved rather than taking the feat.
function offHandDaggerRow(damageModifier: number): AttackRow {
  return attackRow({
    id: "off",
    kind: "weapon",
    name: "Dagger",
    grip: "one-handed",
    damageType: "piercing",
    offHand: true,
    attackSpec: { count: 1, faces: 20, modifier: 5 },
    damageSpec: { count: 1, faces: 6, modifier: damageModifier },
  });
}

// Two equipped light weapons: a main-hand Shortsword and an OFF_HAND dagger whose
// damage snapshot carries STR +3 folded into damageModifier (abilityModifier: 3).
function twoWeaponCharacter(
  overrides: Partial<Character> = {},
  offHand: AttackRow | null = offHandDaggerRow(0),
): Character {
  const weapon = (name: string, id: string, slot: "MAIN_HAND" | "OFF_HAND", type: string) => ({
    id,
    name,
    category: "weapon" as const,
    quantity: 1,
    equipped: true,
    equippedSlot: slot,
    weapon: {
      damageDiceCount: 1,
      damageDiceFaces: 6,
      damageModifier: 3,
      damageType: type,
      light: true,
      attackBonus: 5,
      damage: {
        damageDiceCount: 1,
        damageDiceFaces: 6,
        damageModifier: 3,
        abilityModifier: 3,
        damageType: type,
        grip: "one-handed" as const,
      },
    },
  });
  const mainHandRow = attackRow({
    id: "main",
    kind: "weapon",
    name: "Shortsword",
    grip: "one-handed",
    damageType: "slashing",
    attackSpec: { count: 1, faces: 20, modifier: 5 },
    damageSpec: { count: 1, faces: 6, modifier: 3 },
  });
  return {
    id: "char-1",
    name: "Tester",
    inventory: [
      weapon("Shortsword", "main", "MAIN_HAND", "slashing"),
      weapon("Dagger", "off", "OFF_HAND", "piercing"),
    ],
    attacksPerAction: 1,
    critRange: 20,
    unarmedStrike: { attackBonus: 2, damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" } },
    improvisedWeapon: { attackBonus: 2, damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" }, proficient: false },
    resources: { pools: [] },
    advancements: [],
    attackRows: [mainHandRow, ...(offHand ? [offHand] : []), UNARMED_ROW, IMPROVISED_ROW],
    ...overrides,
  } as unknown as Character;
}

function renderPicker(
  character: Character,
  turnState: TurnState & TurnStateActions,
  handlers: Partial<{ onClose: () => void; onCancel: () => void; variant: "twf" | "unarmed" }> = {},
) {
  return renderWithCharacter(
    <RollProvider>
      <InlineOffHandPicker
        turnState={turnState}
        variant={handlers.variant}
        onClose={handlers.onClose ?? vi.fn()}
        onCancel={handlers.onCancel ?? vi.fn()}
        onLogChanged={vi.fn()}
      />
    </RollProvider>,
    character,
  );
}

describe("InlineOffHandPicker (#813 redesign, rewired onto the shared resolver #1845)", () => {
  it("renders the off-hand form with the '(off-hand)' tag and the ability mod dropped (no style)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }));
    // Named once in the stats summary and once in the rail's own "Roll to
    // hit" step header (ResolutionRail's own `view.source`, #1831) — both are
    // real, expected renders of the same swing.
    expect(screen.getAllByText("Dagger (off-hand)").length).toBeGreaterThan(0);
    // STR +3 dropped → 1d6 piercing (no modifier shown).
    expect(screen.getByText(/1d6 piercing/)).toBeInTheDocument();
    expect(screen.queryByText(/1d6 \+ 3/)).not.toBeInTheDocument();
  });

  // With the Two-Weapon Fighting style the SERVER keeps the ability mod on the
  // off-hand row (deriveOffHandDamage); this sheet just has to label what it is
  // served, so the fixture serves the un-reduced modifier rather than the feat.
  it("labels the full ability mod when the served off-hand row kept it (TWF style)", () => {
    const character = twoWeaponCharacter({}, offHandDaggerRow(3));
    renderPicker(character, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText(/1d6 \+ 3 piercing/)).toBeInTheDocument();
  });

  it("uses the same rail shell as the main sheet (Roll to hit → Damage, one swing)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByRole("button", { name: /Roll to hit/ })).toBeInTheDocument();
    // No "Attacking with" selector — a bonus swing always resolves one form.
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("commits ONE resolveAction op with cost.kind bonus when the off-hand swing resolves", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 1, used: 0 });
    vi.mocked(applyResolveActionOperations).mockResolvedValue({ ...twoWeaponCharacter(), batchId: "test-batch" });
    renderPicker(twoWeaponCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    const [characterId, ops] = vi.mocked(applyResolveActionOperations).mock.calls[0];
    expect(characterId).toBe("char-1");
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ type: "resolveAction", source: "Dagger (off-hand)", cost: { kind: "bonus" } });
  });

  it("appends a bonusAction-source tally row the instant to-hit rolls (recordTwfAttack)", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 1, used: 0 });
    renderPicker(twoWeaponCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordTwfAttack).toHaveBeenCalledOnce();
    expect(turnState.recordTwfAttack).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bonusAction", formName: "Dagger (off-hand)" }),
    );
  });

  it("never calls logRoll for the off-hand swing's attack/damage rolls (retired #1845)", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 1, used: 0 });
    vi.mocked(applyResolveActionOperations).mockResolvedValue({ ...twoWeaponCharacter(), batchId: "test-batch" });
    renderPicker(twoWeaponCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));

    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));
    expect(vi.mocked(logRollAction)).not.toHaveBeenCalled();
  });

  // A single swing: once committed, ResolutionRail's own "Done" is gone
  // (view.completed) and the footer's OWN "Done" is the only one left,
  // Roll to hit disabled behind it — mirrors the pre-#1845 "bonusAttack
  // cleared" terminal state, now reached via the real commit path rather
  // than a synthetic already-null mount (turnState.bonusAttack going null
  // server-side doesn't retroactively affect an already-mounted sheet; this
  // hook's own local completedSwings counter is what the terminal UI reads).
  it("shows Done and disables Roll to hit once the swing has been committed", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 1, used: 0 });
    vi.mocked(applyResolveActionOperations).mockResolvedValue({ ...twoWeaponCharacter(), batchId: "test-batch" });
    renderPicker(twoWeaponCharacter(), turnState);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Done$/ }));
    await waitFor(() => expect(vi.mocked(applyResolveActionOperations)).toHaveBeenCalledTimes(1));

    await waitFor(() => expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: /Roll to hit/ })).not.toBeInTheDocument();
  });

  it("shows Cancel — refund bonus action before the swing is rolled", () => {
    const onCancel = vi.fn();
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }), { onCancel });
    expect(screen.getByRole("button", { name: /Cancel — refund bonus action/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("offers the Battle Master maneuvers disclosure on the off-hand swing (RAW)", () => {
    const bm = twoWeaponCharacter({
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown: [],
      },
    } as unknown as Partial<Character>);
    renderPicker(bm, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByRole("button", { name: /Battle Master maneuvers/ })).toBeInTheDocument();
  });

  it("variant=unarmed renders the Unarmed Strike form, no weapon toggle (#1218)", () => {
    renderPicker(twoWeaponCharacter(), makeTurnState({ total: 1, used: 0 }), { variant: "unarmed" });
    expect(screen.getAllByText("Unarmed Strike").length).toBeGreaterThan(0);
    expect(screen.queryByText("Dagger (off-hand)")).not.toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
  });

  it("variant=unarmed ignores equipped weapons entirely, even with no off-hand weapon", () => {
    // No served off-hand row, so variant=twf would hit the "No off-hand weapon
    // equipped" branch — the unarmed row is always served, so this swing is not.
    const solo = twoWeaponCharacter({
      inventory: [
        {
          id: "main",
          name: "Shortsword",
          category: "weapon",
          quantity: 1,
          equipped: true,
          equippedSlot: "MAIN_HAND",
          weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, damageType: "slashing", light: true, attackBonus: 5 },
        },
      ] as unknown as Character["inventory"],
    }, null);
    renderPicker(solo, makeTurnState({ total: 1, used: 0 }), { variant: "unarmed" });
    expect(screen.getAllByText("Unarmed Strike").length).toBeGreaterThan(0);
    expect(screen.queryByText(/No off-hand weapon equipped/i)).not.toBeInTheDocument();
  });

  it("variant=unarmed spends the bonus action and records the swing as Unarmed Strike", async () => {
    seedMid();
    const turnState = makeTurnState({ total: 1, used: 0 });
    renderPicker(twoWeaponCharacter(), turnState, { variant: "unarmed" });

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(turnState.recordTwfAttack).toHaveBeenCalledOnce();
    expect(turnState.recordTwfAttack).toHaveBeenCalledWith(
      expect.objectContaining({ source: "bonusAction", formName: "Unarmed Strike" }),
    );
  });

  it("falls back to a helpful message when no off-hand weapon is equipped", () => {
    const solo = twoWeaponCharacter({
      inventory: [
        {
          id: "main",
          name: "Shortsword",
          category: "weapon",
          quantity: 1,
          equipped: true,
          equippedSlot: "MAIN_HAND",
          weapon: { damageDiceCount: 1, damageDiceFaces: 6, damageModifier: 3, damageType: "slashing", light: true, attackBonus: 5 },
        },
      ] as unknown as Character["inventory"],
    }, null);
    renderPicker(solo, makeTurnState({ total: 1, used: 0 }));
    expect(screen.getByText(/No off-hand weapon equipped/i)).toBeInTheDocument();
  });
});
