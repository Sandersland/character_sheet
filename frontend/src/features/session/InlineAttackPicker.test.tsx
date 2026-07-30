import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useEffect } from "react";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineAttackPicker from "@/features/session/InlineAttackPicker";
import { RollProvider } from "@/features/dice/RollContext";
import { useTurnState } from "@/features/session/useTurnState";
import { logRoll, castManeuverTransaction } from "@/api/client";
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
  castManeuverTransaction: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
  // Re-establish the resolved value — a per-describe restoreAllMocks resets it.
  vi.mocked(logRoll).mockResolvedValue(undefined);
});

// Minimal turn state: an Attack action in progress with one attack available.
const turnState = {
  attack: { total: 1, used: 0 },
  bonusActionUsed: false,
  reactionUsed: false,
  attackTally: [],
  recordAttack: vi.fn(),
  setTallyDamage: vi.fn(),
  setTallyAttackTotal: vi.fn(),
  addTallyDamageRider: vi.fn(),
  cycleTallyVerdict: vi.fn(),
  consumeBonusAction: vi.fn(),
  consumeReaction: vi.fn(),
} as unknown as TurnState & TurnStateActions;

// The picker renders `character.attackRows` (#1434). `attackRows` in the overrides
// lists only the WEAPON rows the server would have served; the two rows every
// payload always carries are appended here so no test has to restate them.
function makeCharacter(overrides: Partial<Character> = {}): Character {
  return {
    id: "char-1",
    name: "Tester",
    inventory: [],
    attacksPerAction: 1,
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

function renderPicker(
  character: Character,
  onLogChanged = vi.fn(),
  opts: RenderOpts = {},
) {
  const onCancel = opts.onCancel ?? vi.fn();
  const onClose = opts.onClose ?? vi.fn();
  renderWithCharacter(
    <RollProvider>
      <InlineAttackPicker
        turnState={opts.turnState ?? turnState}
        sessionId="sess-1"
        onClose={onClose}
        onCancel={onCancel}
        onLogChanged={onLogChanged}
      />
    </RollProvider>,
    character,
  );
  return { onCancel, onClose };
}

// The served row for an equipped weapon: +3 to hit, 1d8 slashing.
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
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1"), weaponRow("Dagger", "inv-2")],
      }),
    );
    expect(screen.getByRole("radiogroup", { name: /Attacking with/ })).toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(4);
    expect(screen.getByRole("radio", { name: "Longsword" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dagger" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Unarmed Strike" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Improvised Weapon" })).toBeInTheDocument();
  });

  it("shows the sheet's own ADV/DIS control and defaults to Normal (#958)", async () => {
    const user = userEvent.setup();
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1")],
      }),
    );
    const mode = screen.getByRole("group", { name: "Attack roll mode" });
    expect(mode).toBeInTheDocument();
    expect(within(mode).getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "true");

    await user.click(within(mode).getByRole("button", { name: "Advantage" }));
    expect(within(mode).getByRole("button", { name: "Advantage" })).toHaveAttribute("aria-pressed", "true");
    expect(within(mode).getByRole("button", { name: "Normal" })).toHaveAttribute("aria-pressed", "false");
  });

  it("shows exactly one attack card (one Roll to hit) and one damage card", () => {
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1"), weaponRow("Dagger", "inv-2")],
      }),
    );
    expect(screen.getAllByRole("button", { name: /Roll to hit/ })).toHaveLength(1);
    expect(screen.getAllByRole("button", { name: /Roll damage/ })).toHaveLength(1);
  });

  it("keeps a visibly checked form when the selected weapon leaves the inventory", async () => {
    const user = userEvent.setup();
    const shared = {
      turnState,
      sessionId: "sess-1",
      onClose: vi.fn(),
      onCancel: vi.fn(),
      onLogChanged: vi.fn(),
    };
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
    expect(screen.getByRole("radio", { name: "Dagger" })).toHaveAttribute("aria-checked", "true");

    // The selected weapon disappears mid-open (live inventory change) — the
    // selector must fall back to a visibly checked option, never nothing-selected.
    // InlineAttackPicker reads useCurrentCharacter(), so simulating the live
    // inventory change means writing the cache directly (there's no prop to swap).
    getQueryClient().setQueryData(
      characterKeys.detail(initialCharacter.id),
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1")],
      }),
    );
    rerender(
      <RollProvider>
        <InlineAttackPicker {...shared} />
      </RollProvider>,
    );
    const checked = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("aria-checked") === "true");
    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("Longsword");
  });

  it("collapses two same-name equipped weapons into a single segment", () => {
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Dagger", "inv-1"), weaponRow("Dagger", "inv-2")],
      }),
    );
    expect(screen.getAllByRole("radio", { name: "Dagger" })).toHaveLength(1);
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("defaults the selection to the main-hand weapon", () => {
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1"), weaponRow("Dagger", "inv-2")],
      }),
    );
    expect(screen.getByRole("radio", { name: "Longsword" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Dagger" })).not.toBeChecked();
  });

  // The server only emits a row for an EQUIPPED weapon, so a bagged Longsword
  // never reaches this sheet at all (backend character-serialize-attack-rows.test.ts
  // pins that); the picker must then offer only Unarmed + Improvised.
  it("never surfaces a weapon the server served no row for", () => {
    renderPicker(makeCharacter());
    expect(screen.queryByRole("radio", { name: "Longsword" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
  });

  it("shows the turn-screen empty-state hint and defaults to Unarmed when no weapon is equipped", () => {
    renderPicker(makeCharacter());
    const hint = screen.getByText(/No weapon equipped/i);
    expect(hint.textContent).toMatch(/Change/);
    expect(hint.textContent).toMatch(/turn screen/i);
    expect(screen.getByRole("radio", { name: "Unarmed Strike" })).toBeChecked();
  });
});

describe("InlineAttackPicker — selecting a form updates the card (#786)", () => {
  it("selecting Improvised shows its signed bonus and the no-proficiency note", async () => {
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1")],
      }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "Improvised Weapon" }));
    expect(screen.getByText(/\+2 to hit · 1d4 bludgeoning/)).toBeInTheDocument();
    expect(screen.getByText(/\(no proficiency\)/)).toBeInTheDocument();
  });

  it("selecting Unarmed shows its bonus and flat bludgeoning damage preview", async () => {
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1")],
      }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "Unarmed Strike" }));
    expect(screen.getByText(/\+2 to hit · 1 bludgeoning/)).toBeInTheDocument();
  });

  it("rolls to hit with the selected form (logs the Improvised source)", async () => {
    renderPicker(
      makeCharacter({
        attackRows: [weaponRow("Longsword", "inv-1")],
      }),
    );
    await userEvent.click(screen.getByRole("radio", { name: "Improvised Weapon" }));
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "attack", source: "Improvised Weapon" }),
    );
  });
});

describe("InlineAttackPicker — live attack counter (#757)", () => {
  const attackState = (total: number, used: number) =>
    ({ ...turnState, attack: { total, used } }) as unknown as TurnState & TurnStateActions;

  function withWeapon(attacksPerAction: number) {
    return makeCharacter({
      attacksPerAction,
      attackRows: [weaponRow("Longsword", "inv-1")],
    });
  }

  it("renders the live pip counter for a multi-attack action (2 of 2 remaining)", () => {
    renderPicker(withWeapon(2), vi.fn(), { turnState: attackState(2, 0) });
    expect(screen.getByText(/Attacks · 2 of 2 remaining/)).toBeInTheDocument();
  });

  it("shows the counter decremented after one recorded attack (1 of 2 remaining)", () => {
    renderPicker(withWeapon(2), vi.fn(), { turnState: attackState(2, 1) });
    expect(screen.getByText(/Attacks · 1 of 2 remaining/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll to hit/ })).not.toBeDisabled();
  });

  it("disables the single Roll-to-hit button when attacks are exhausted", () => {
    renderPicker(withWeapon(2), vi.fn(), { turnState: attackState(2, 2) });
    expect(screen.getByText(/Attacks · 0 of 2 remaining/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Roll to hit/ })).toBeDisabled();
    // The standalone Critical buttons were removed (#766) — crit is auto/verdict now.
    expect(screen.queryByRole("button", { name: /^Critical$/ })).not.toBeInTheDocument();
  });

  it("hides the pip counter for a single-attack action", () => {
    renderPicker(withWeapon(1), vi.fn(), { turnState: attackState(1, 0) });
    expect(screen.queryByText(/of 1 remaining/)).not.toBeInTheDocument();
  });

  it("carries no kicker copy of its own — the sheet header owns it (TurnResolutionSheets)", () => {
    renderPicker(withWeapon(2), vi.fn(), { turnState: attackState(2, 0) });
    expect(screen.queryByText(/no target AC tracked/)).not.toBeInTheDocument();
  });
});

describe("InlineAttackPicker — Damage card is inert until a hit is rolled (#786)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("disables Roll damage until a to-hit roll binds a form, then enables it", async () => {
    // Mid-face seed → a non-crit to-hit so the button stays labelled "Roll damage".
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    renderPicker(
      makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1")] }),
    );

    expect(screen.getByRole("button", { name: /Roll damage/ })).toBeDisabled();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    expect(screen.getByRole("button", { name: /Roll damage/ })).not.toBeDisabled();
  });
});

describe("InlineAttackPicker — footer", () => {
  it("offers Cancel — refund action before any attack is rolled, wired to onCancel", async () => {
    const { onCancel } = renderPicker(makeCharacter());
    const cancel = screen.getByRole("button", { name: /Cancel — refund action/ });
    await userEvent.click(cancel);
    expect(onCancel).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^Done$/ })).not.toBeInTheDocument();
  });

  it("switches to Done once an attack has been rolled", () => {
    const rolledTurnState = {
      ...turnState,
      attack: { total: 1, used: 1 },
    } as unknown as TurnState & TurnStateActions;
    renderPicker(makeCharacter(), vi.fn(), { turnState: rolledTurnState });
    expect(screen.getByRole("button", { name: /^Done$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Cancel — refund action/ })).not.toBeInTheDocument();
  });
});

// A weapon row carrying a dice-valued on-hit rider. Riders are gated server-side
// on `isItemActive`, so an equipped-but-unattuned attunement item is served NONE at
// all (backend character-serialize-attack-rows.test.ts owns that rule) — a fixture
// that wants no rider passes `damageRiders: []`.
function flameTongueRow(overrides: Partial<AttackRow> = {}): AttackRow {
  return weaponRow("Flame Tongue", "inv-flame", {
    damageRiders: [
      { id: "inv-flame:rider:0", spec: { count: 2, faces: 6, modifier: 0 }, damageType: "fire" },
    ],
    ...overrides,
  });
}

describe("InlineAttackPicker — on-hit dice riders", () => {
  it("renders a typed rider button for an attuned Flame Tongue after a hit and rolls it with the fire type", async () => {
    const onLogChanged = vi.fn();
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow()] }),
      onLogChanged,
    );

    // The Damage card (with its riders) is inert until a form is rolled to hit.
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    const riderButton = screen.getByRole("button", { name: /Roll \+2d6 fire/ });
    expect(riderButton).toBeInTheDocument();

    await userEvent.click(riderButton);

    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "damage", source: "Flame Tongue", damageType: "fire" }),
    );
  });

  it("hides the rider when the served row carries none (an unattuned attunement item)", async () => {
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow({ damageRiders: [] })] }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.queryByRole("button", { name: /Roll \+2d6 fire/ })).not.toBeInTheDocument();
  });

  it("shows a conditional rider's condition as reminder text", async () => {
    renderPicker(
      makeCharacter({
        attackRows: [
          flameTongueRow({
            name: "Dragon Slayer",
            damageRiders: [
              { id: "inv-flame:rider:0", spec: { count: 3, faces: 6, modifier: 0 }, condition: "vs dragons" },
            ],
          }),
        ],
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/vs dragons/)).toBeInTheDocument();
  });

  it("only shows the last-rolled form's rider — a second weapon's is not on the card", async () => {
    const plainSword = weaponRow("Longsword", "inv-plain", {
      attackSpec: { count: 1, faces: 20, modifier: 2 },
    });
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow(), plainSword] }),
    );
    // Default form is the main-hand Flame Tongue — roll to hit binds the Damage card to it.
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getAllByRole("button", { name: /Roll \+\dd\d/ })).toHaveLength(1);
  });
});

describe("InlineAttackPicker — auto-crit on a natural 20 (#766)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 0.95 → 1 + floor(0.95 * faces): a natural 20 on a d20, and the top face elsewhere.
  const seedTopFace = () => vi.spyOn(Math, "random").mockReturnValue(0.95);
  // 0 → 1 + floor(0): a natural 1 on a d20.
  const seedNat1 = () => vi.spyOn(Math, "random").mockReturnValue(0);
  // Mid face → a non-crit, non-miss to-hit.
  const seedMid = () => vi.spyOn(Math, "random").mockReturnValue(0.5);

  const findDamageCall = () =>
    vi.mocked(logRoll).mock.calls.map((c) => c[2]).find((e) => e.kind === "damage");

  it("shows 'Critical hit!' and auto-rolls doubled damage after a nat-20 to-hit", async () => {
    seedTopFace();
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow({ damageRiders: [] })] }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/Critical hit!/)).toBeInTheDocument();

    // The Damage button flipped its label — no separate button press to crit.
    const dmg = screen.getByRole("button", { name: /Roll crit damage/ });
    await userEvent.click(dmg);

    const call = findDamageCall();
    expect(call!.specLabel).toBe("2d8 (crit)"); // 1d8 slashing → doubled dice
    expect(call!.faces).toHaveLength(2);
  });

  it("doubles the on-hit dice rider automatically under the auto-crit flow", async () => {
    seedTopFace();
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow()] }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll crit damage/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));

    const riderCall = vi
      .mocked(logRoll)
      .mock.calls.map((c) => c[2])
      .find((entry) => entry.damageType === "fire");
    expect(riderCall!.specLabel).toBe("4d6 (crit)");
    expect(riderCall!.faces).toHaveLength(4);
  });

  it("shows a Miss indicator on a natural 1 and leaves damage rollable (non-crit)", async () => {
    seedNat1();
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow({ damageRiders: [] })] }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/^Miss$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Roll damage$/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Roll crit damage/ })).not.toBeInTheDocument();
  });

  it("keeps a dice rider single when the weapon damage was rolled normally", async () => {
    seedMid();
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow()] }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll \+2d6 fire/ }));

    const riderCall = vi
      .mocked(logRoll)
      .mock.calls.map((c) => c[2])
      .find((entry) => entry.damageType === "fire");
    expect(riderCall!.specLabel).toBe("2d6");
    expect(riderCall!.faces).toHaveLength(2);
  });
});

describe("InlineAttackPicker — manual crit via verdict (#766/#811)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("has no standalone 'Critical' button and no Crit checkbox in the sheet", () => {
    renderPicker(
      makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1")] }),
    );
    expect(screen.queryByRole("button", { name: /^Critical$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  // Live turn state — the verdict is the crit authority, and it lives in the tally.
  function LiveHarness({ character }: { character: Character }) {
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
          sessionId="sess-crit"
          onClose={vi.fn()}
          onCancel={vi.fn()}
          onLogChanged={vi.fn()}
        />
      </RollProvider>
    );
  }

  it("calling Crit! flips the damage roll to doubled dice (verdict is the crit authority)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // non-crit to-hit
    const character = makeCharacter({
      attackRows: [flameTongueRow({ damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Crit!$/ }));
    await userEvent.click(screen.getByRole("button", { name: /Roll crit damage/ }));

    const call = vi.mocked(logRoll).mock.calls.map((c) => c[2]).find((e) => e.kind === "damage");
    expect(call!.specLabel).toBe("2d8 (crit)");
    expect(call!.faces).toHaveLength(2);
  });

  it("'it Missed' re-arms the next attack; skip leaves the row unresolved", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const character = makeCharacter({
      attacksPerAction: 3,
      attackRows: [flameTongueRow({ damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    // Attack 1 → call it a miss: the row dims into the tally (Miss chip) and
    // the card resets with the next attack armed.
    await userEvent.click(screen.getByRole("button", { name: "Roll to hit" }));
    await userEvent.click(screen.getByRole("button", { name: "it Missed" }));
    expect(screen.getByRole("button", { name: /Roll to hit — attack 2 of 3/ })).toBeInTheDocument();
    expect(screen.getByText("Miss")).toBeInTheDocument(); // tally chip

    // Attack 2 → skip (attacks remain): the row stays unresolved and the tally
    // asks the question instead of claiming a hit.
    await userEvent.click(screen.getByRole("button", { name: /Roll to hit — attack 2 of 3/ }));
    await userEvent.click(screen.getByRole("button", { name: /Skip — roll next attack/ }));
    expect(screen.getByRole("button", { name: "hit or miss?" })).toBeInTheDocument();
  });

  it("a resolved attack's continue button reads 'Next' and re-arms step 1 for a two-tap next roll (#834)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const character = makeCharacter({
      attacksPerAction: 2,
      attackRows: [flameTongueRow({ damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    // Resolve attack 1 (damage = implicit hit).
    await userEvent.click(screen.getByRole("button", { name: "Roll to hit" }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));
    expect(screen.getByText("✓ Hit")).toBeInTheDocument();

    // The continue affordance is a plain "Next" — no instant re-roll button.
    expect(
      screen.queryByRole("button", { name: /Roll to hit — attack 2 of 2/ }),
    ).not.toBeInTheDocument();
    const next = screen.getByRole("button", { name: "Next" });

    await userEvent.click(next);

    // Card resets to step 1, still armed with the right ordinal — not an
    // already-rolled attack 2.
    expect(screen.getByRole("button", { name: "Roll to hit — attack 2 of 2" })).toBeInTheDocument();
    expect(screen.queryByText("✓ Hit")).not.toBeInTheDocument();
  });

  it("rolling damage marks the current row hit (implicit hit) with Crit! still offered", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const character = makeCharacter({
      attackRows: [flameTongueRow({ damageRiders: [] })],
    });
    renderWithCharacter(<LiveHarness character={character} />, character);

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/Ask your DM/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));

    expect(screen.getByText("✓ Hit")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Crit!$/ })).toBeInTheDocument();
    expect(screen.queryByText(/hit or miss\?/)).not.toBeInTheDocument();
  });
});

describe("InlineAttackPicker — Damage card copy (#786)", () => {
  it("labels the inert Damage card by prompt and names the form once a hit is rolled", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    renderPicker(
      makeCharacter({ attackRows: [weaponRow("Longsword", "inv-1")] }),
    );
    expect(screen.queryByText(/land the hit/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Roll to hit first — then roll damage/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getByText(/Longsword · 1d8 slashing/)).toBeInTheDocument();
    vi.restoreAllMocks();
  });
});

describe("InlineAttackPicker — Damage card maneuver state resets on form switch (#756)", () => {
  const SERVER_ROLL = 5;

  function battleMaster(): Character {
    return makeCharacter({
      attackRows: [
        weaponRow("Longsword", "inv-1", {
          damageType: "slashing",
          attackSpec: { count: 1, faces: 20, modifier: 5 },
          damageSpec: { count: 1, faces: 8, modifier: 0 },
        }),
        weaponRow("Dagger", "inv-2", {
          damageType: "piercing",
          attackSpec: { count: 1, faces: 20, modifier: 5 },
          damageSpec: { count: 1, faces: 4, modifier: 0 },
        }),
      ],
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown: [
          { id: "m-precision", name: "Precision Attack", description: "Add to the attack roll.", placement: "attackRoll" },
        ],
      },
    } as unknown as Character);
  }

  it("re-enables the spend button on the newly rolled form after a die was spent on another", async () => {
    const user = userEvent.setup();
    vi.mocked(castManeuverTransaction).mockResolvedValue({
      character: battleMaster(),
      results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Precision Attack" }],
    } as unknown as Awaited<ReturnType<typeof castManeuverTransaction>>);

    renderPicker(battleMaster());

    // Roll to hit with the default (Longsword) form, then open the maneuvers
    // disclosure (#811 — collapsed by default) so the attack maneuver shows.
    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await user.click(screen.getByRole("button", { name: /Battle Master maneuvers/ }));
    const spend = await screen.findByRole("button", { name: /Precision Attack/ });
    await user.click(spend);
    // Spent in this form's context → button disabled.
    await waitFor(() => expect(spend).toBeDisabled());

    // "Next" re-arms step 1 (#834) — then switch the selected form to the
    // Dagger and roll to hit for it.
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: "Dagger" }));
    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));

    // A fresh prompt instance for the new form → no die spent in its context yet.
    const daggerSpend = await screen.findByRole("button", { name: /Precision Attack/ });
    expect(daggerSpend).not.toBeDisabled();
  });
});

describe("InlineAttackPicker — persistent inline roll result (#745)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows the attack die box after rolling to hit", async () => {
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow({ damageRiders: [] })] }),
    );

    // No result visible until a roll happens.
    expect(screen.queryByText("d20")).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));

    // The to-hit d20 die box now persists on the card (value is random; the
    // caption is deterministic).
    expect(screen.getByText("d20")).toBeInTheDocument();
  });

  it("shows the weapon damage die box after rolling to hit then damage", async () => {
    vi.spyOn(Math, "random").mockReturnValue(0.5); // non-crit → a single d8 box
    renderPicker(
      makeCharacter({ attackRows: [flameTongueRow({ damageRiders: [] })] }),
    );

    await userEvent.click(screen.getByRole("button", { name: /Roll to hit/ }));
    await userEvent.click(screen.getByRole("button", { name: /^Roll damage$/ }));

    // Flame Tongue base damage is 1d8 slashing.
    expect(screen.getByText("d8")).toBeInTheDocument();
    expect(screen.getByText("slashing")).toBeInTheDocument();
  });
});

// #809 — the Precision Attack affordance is hosted under the ATTACK card, and a
// spend after a to-hit roll boosts the on-card result line AND the #802 tally row
// (via a real useTurnState — the tally lives there). SERVER_ROLL adds 5.
describe("InlineAttackPicker — Precision Attack under the attack card (#809)", () => {
  const SERVER_ROLL = 5;

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  function battleMaster(): Character {
    return makeCharacter({
      attackRows: [
        weaponRow("Longsword", "inv-1", {
          damageType: "slashing",
          attackSpec: { count: 1, faces: 20, modifier: 5 },
          damageSpec: { count: 1, faces: 8, modifier: 0 },
        }),
      ],
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
        ],
        maneuversKnown: [
          { id: "m-precision", name: "Precision Attack", description: "Add to the attack roll.", placement: "attackRoll" },
        ],
      },
    } as unknown as Character);
  }

  // Drives a live useTurnState into an in-progress Attack action so the tally is real.
  function Harness({ character }: { character: Character }) {
    const turnState = useTurnState(character, "sess-precision");
    useEffect(() => {
      turnState.startCombat();
      turnState.startTurn();
      turnState.enterAttackMode();
      // eslint-disable-next-line react-hooks/exhaustive-deps -- harness drives into attack mode once on mount; empty deps intentional
    }, []);
    return (
      <RollProvider>
        <InlineAttackPicker
          turnState={turnState}
          sessionId="sess-precision"
          onClose={vi.fn()}
          onCancel={vi.fn()}
          onLogChanged={vi.fn()}
        />
      </RollProvider>
    );
  }

  it("spending Precision after a to-hit boosts the result line and the tally row", async () => {
    const user = userEvent.setup();
    vi.spyOn(Math, "random").mockReturnValue(0.5); // d20 face 11 → non-crit, non-miss
    vi.mocked(castManeuverTransaction).mockResolvedValue({
      character: battleMaster(),
      results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Precision Attack" }],
    } as unknown as Awaited<ReturnType<typeof castManeuverTransaction>>);

    const character = battleMaster();
    renderWithCharacter(<Harness character={character} />, character);

    // 11 (d20) + 5 (attackBonus) = 16 to hit. The tally row and result line agree.
    await user.click(screen.getByRole("button", { name: /Roll to hit/ }));
    expect(screen.getAllByText("16").length).toBeGreaterThanOrEqual(1);

    // The Precision affordance lives behind the maneuvers disclosure (#811) —
    // attack section only, no damage roll yet.
    await user.click(screen.getByRole("button", { name: /Battle Master maneuvers/ }));
    expect(screen.getByText("Add to Attack:")).toBeInTheDocument();
    expect(screen.queryByText("Add to Damage:")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Precision Attack/ }));

    // 16 + 5 (superiority die) = 21 everywhere; the old 16 is gone.
    await waitFor(() => expect(screen.getAllByText("21").length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText("16")).not.toBeInTheDocument();
    expect(screen.getByText("(+maneuver)")).toBeInTheDocument();
  });
});
