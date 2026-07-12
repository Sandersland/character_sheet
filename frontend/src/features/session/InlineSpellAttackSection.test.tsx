import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import InlineSpellAttackSection from "@/features/session/InlineSpellAttackSection";
import { RollProvider } from "@/features/dice/RollContext";
import { applySpellcastingTransactions, logRoll } from "@/api/client";
import type { Character, Spell } from "@/types/character";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";

vi.mock("@/api/client", () => ({
  applySpellcastingTransactions: vi.fn(),
  logRoll: vi.fn().mockResolvedValue(undefined),
}));
const mockCast = vi.mocked(applySpellcastingTransactions);

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(logRoll).mockResolvedValue(undefined);
});

const fireBolt = {
  id: "fb", name: "Fire Bolt", level: 0, attackType: "attack",
  effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 10, damageType: "fire", cantripScaling: true,
} as unknown as Spell;
const sacredFlame = {
  id: "sf", name: "Sacred Flame", level: 0, attackType: "save",
  effectKind: "damage", effectDiceCount: 1, effectDiceFaces: 8, saveAbility: "dexterity",
} as unknown as Spell;
const scorchingRay = { id: "sr", name: "Scorching Ray", level: 2, attackType: "attack" } as unknown as Spell;

function makeCharacter(spells: Spell[]): Character {
  return {
    id: "char-1",
    level: 1,
    spellcasting: { spellAttackBonus: 5, spells, slots: [] },
  } as unknown as Character;
}

function makeTurnState(): TurnState & TurnStateActions {
  return {
    grantExtraAction: vi.fn(),
    commitActionSpell: vi.fn(),
    recordAttack: vi.fn(),
  } as unknown as TurnState & TurnStateActions;
}

function renderSection(character: Character, turnState = makeTurnState(), onUpdate = vi.fn()) {
  render(
    <RollProvider>
      <InlineSpellAttackSection
        character={character}
        sessionId="sess-1"
        turnState={turnState}
        onUpdate={onUpdate}
        onLogChanged={vi.fn()}
      />
    </RollProvider>,
  );
  return { turnState, onUpdate };
}

describe("InlineSpellAttackSection (#734)", () => {
  it("lists attack cantrips only — excludes save cantrips and leveled attack spells", () => {
    renderSection(makeCharacter([fireBolt, sacredFlame, scorchingRay]));
    expect(screen.getByText("Fire Bolt")).toBeInTheDocument();
    expect(screen.queryByText("Sacred Flame")).not.toBeInTheDocument();
    expect(screen.queryByText("Scorching Ray")).not.toBeInTheDocument();
  });

  it("renders nothing when the character has no attack cantrips", () => {
    const { container } = render(
      <RollProvider>
        <InlineSpellAttackSection
          character={makeCharacter([sacredFlame])}
          sessionId="s"
          turnState={makeTurnState()}
          onUpdate={vi.fn()}
          onLogChanged={vi.fn()}
        />
      </RollProvider>,
    );
    expect(container.textContent).not.toMatch(/Spell attacks/);
  });

  it("gates Cast until the spell attack is rolled", async () => {
    const user = userEvent.setup();
    renderSection(makeCharacter([fireBolt]));
    expect(screen.getByRole("button", { name: "Cast" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /^Attack/ }));
    expect(screen.getByRole("button", { name: "Cast" })).toBeEnabled();
  });

  it("Attack rolls a d20 spell attack, logs it, and locks the commitment via recordAttack", async () => {
    const user = userEvent.setup();
    const turnState = makeTurnState();
    renderSection(makeCharacter([fireBolt]), turnState);
    await user.click(screen.getByRole("button", { name: /^Attack/ }));
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "attack", source: "Fire Bolt" }),
    );
    // Marks an attack made so the "Back" refund is no longer offered (no peek-and-cancel).
    expect(turnState.recordAttack).toHaveBeenCalledOnce();
  });

  it("Cast rolls damage, posts the cantrip castSpell op, and grants-then-commits so the action nets to −1 (no double-spend)", async () => {
    const user = userEvent.setup();
    const { turnState, onUpdate } = renderSection(makeCharacter([fireBolt]));
    mockCast.mockResolvedValue(makeCharacter([fireBolt]));

    await user.click(screen.getByRole("button", { name: /^Attack/ }));
    await user.click(screen.getByRole("button", { name: "Cast" }));

    await waitFor(() =>
      expect(mockCast).toHaveBeenCalledWith("char-1", [
        expect.objectContaining({ type: "castSpell", entryId: "fb", roll: expect.any(Number) }),
      ]),
    );
    // Cantrip op omits slotLevel.
    expect(mockCast.mock.calls[0][1][0]).not.toHaveProperty("slotLevel");
    expect(onUpdate).toHaveBeenCalled();
    // Grant-then-commit nets to zero action decrement (no double-spend on Action Surge).
    expect(turnState.grantExtraAction).toHaveBeenCalledOnce();
    expect(turnState.commitActionSpell).toHaveBeenCalledWith(0);
    expect(vi.mocked(logRoll)).toHaveBeenCalledWith(
      "char-1",
      "sess-1",
      expect.objectContaining({ kind: "damage", source: "Fire Bolt" }),
    );
  });
});

describe("InlineSpellAttackSection — nat-20 auto-crit (#766)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows 'Critical hit!' and doubles the cantrip damage dice on a nat-20 to-hit", async () => {
    const user = userEvent.setup();
    // 0.95 → nat 20 on the d20 to-hit, top face on the 1d10 damage.
    vi.spyOn(Math, "random").mockReturnValue(0.95);
    const { onUpdate } = renderSection(makeCharacter([fireBolt]));
    mockCast.mockResolvedValue(makeCharacter([fireBolt]));

    await user.click(screen.getByRole("button", { name: /^Attack/ }));
    expect(screen.getByText(/Critical hit!/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cast" }));
    await waitFor(() => expect(onUpdate).toHaveBeenCalled());

    const damageCall = vi
      .mocked(logRoll)
      .mock.calls.map((c) => c[2])
      .find((e) => e.kind === "damage");
    expect(damageCall!.specLabel).toBe("2d10 (crit)"); // 1d10 fire → doubled dice
    expect(damageCall!.faces).toHaveLength(2);
  });
});
