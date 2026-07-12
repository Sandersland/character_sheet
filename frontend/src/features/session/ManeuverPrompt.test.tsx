import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ManeuverPrompt from "@/features/session/ManeuverPrompt";
import { castManeuverTransaction } from "@/api/client";
import type { Character } from "@/types/character";
import type { RollResult } from "@/lib/dice";

vi.mock("@/api/client", () => ({
  castManeuverTransaction: vi.fn(),
}));

// Server rolls a 5 on the superiority die for every cast in these tests.
const SERVER_ROLL = 5;

function makeCharacter(): Character {
  return {
    id: "char-1",
    resources: {
      pools: [
        { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 0, remaining: 4 },
      ],
      maneuversKnown: [
        { id: "m-precision", name: "Precision Attack", description: "Add to the attack roll.", placement: "attackRoll" },
        { id: "m-trip", name: "Trip Attack", description: "Add to the damage roll.", placement: "damageRoll" },
      ],
    },
  } as unknown as Character;
}

const roll = (total: number): RollResult => ({ total }) as unknown as RollResult;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(castManeuverTransaction).mockResolvedValue({
    character: makeCharacter(),
    results: [{ roll: SERVER_ROLL, saveDc: 15, summary: "used Trip Attack" }],
  });
});

describe("ManeuverPrompt — die folds into the total", () => {
  it("folds the server-rolled die into the attack total for an attackRoll maneuver", async () => {
    const user = userEvent.setup();
    const onRollsUpdated = vi.fn();
    render(
      <ManeuverPrompt
        character={makeCharacter()}
        section="attack"
        lastAttackRoll={roll(14)}
        lastDamageRoll={null}
        onRollsUpdated={onRollsUpdated}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Precision Attack/ }));

    await waitFor(() =>
      expect(castManeuverTransaction).toHaveBeenCalledWith("char-1", [
        { type: "castManeuver", entryId: "m-precision" },
      ]),
    );
    // 14 (attack) + 5 (server die), damage untouched (null).
    expect(onRollsUpdated).toHaveBeenCalledWith(14 + SERVER_ROLL, null);
  });

  it("folds the server-rolled die into the damage total for a damageRoll maneuver", async () => {
    const user = userEvent.setup();
    const onRollsUpdated = vi.fn();
    render(
      <ManeuverPrompt
        character={makeCharacter()}
        section="damage"
        lastAttackRoll={null}
        lastDamageRoll={roll(9)}
        onRollsUpdated={onRollsUpdated}
        onUpdate={vi.fn()}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Trip Attack/ }));

    await waitFor(() => expect(castManeuverTransaction).toHaveBeenCalled());
    // Attack untouched (null), 9 (damage) + 5 (server die).
    expect(onRollsUpdated).toHaveBeenCalledWith(null, 9 + SERVER_ROLL);
  });

  it("renders nothing before any roll is made", () => {
    const { container } = render(
      <ManeuverPrompt
        character={makeCharacter()}
        section="attack"
        lastAttackRoll={null}
        lastDamageRoll={null}
        onRollsUpdated={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// #809 — each mount renders ONLY its own section, so a maneuver never appears on
// both cards. The attack card hosts section="attack" (Precision), the damage card
// hosts section="damage".
describe("ManeuverPrompt — per-card section hosting (#809)", () => {
  function renderSection(section: "attack" | "damage") {
    return render(
      <ManeuverPrompt
        character={makeCharacter()}
        section={section}
        lastAttackRoll={roll(14)}
        lastDamageRoll={roll(9)}
        onRollsUpdated={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
  }

  it("section=attack shows only the attack half (Precision), never the damage half", () => {
    renderSection("attack");
    expect(screen.getByText("Add to Attack:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Precision Attack/ })).toBeInTheDocument();
    expect(screen.queryByText("Add to Damage:")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Trip Attack/ })).not.toBeInTheDocument();
  });

  it("section=damage shows only the damage half, never the attack half", () => {
    renderSection("damage");
    expect(screen.getByText("Add to Damage:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trip Attack/ })).toBeInTheDocument();
    expect(screen.queryByText("Add to Attack:")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Precision Attack/ })).not.toBeInTheDocument();
  });

  it("section=attack stays empty when only a damage roll exists (no to-hit yet)", () => {
    const { container } = render(
      <ManeuverPrompt
        character={makeCharacter()}
        section="attack"
        lastAttackRoll={null}
        lastDamageRoll={roll(9)}
        onRollsUpdated={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("section=damage stays empty when only an attack roll exists (no damage yet)", () => {
    const { container } = render(
      <ManeuverPrompt
        character={makeCharacter()}
        section="damage"
        lastAttackRoll={roll(14)}
        lastDamageRoll={null}
        onRollsUpdated={vi.fn()}
        onUpdate={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});

// #689 gap pins — the placement-filtering / section-visibility / selection
// branches the lib extraction most endangers. Green before the refactor;
// unedited through it.
describe("ManeuverPrompt — placement filtering and damage selection (#689)", () => {
  type Maneuver = { id: string; name: string; description: string; placement?: string };

  function characterWith(maneuvers: Maneuver[], remaining = 4): Character {
    return {
      id: "char-1",
      resources: {
        pools: [
          { key: "superiorityDice", label: "Superiority Dice", die: "d8", total: 4, recharge: "shortRest", used: 4 - remaining, remaining },
        ],
        maneuversKnown: maneuvers,
      },
    } as unknown as Character;
  }

  function renderPrompt(
    character: Character,
    section: "attack" | "damage",
    attack: number | null,
    damage: number | null,
  ) {
    const onRollsUpdated = vi.fn();
    const { container } = render(
      <ManeuverPrompt
        character={character}
        section={section}
        lastAttackRoll={attack === null ? null : roll(attack)}
        lastDamageRoll={damage === null ? null : roll(damage)}
        onRollsUpdated={onRollsUpdated}
        onUpdate={vi.fn()}
      />,
    );
    return { container, onRollsUpdated };
  }

  it("excludes attackOption/reaction/effect maneuvers — renders nothing for them", () => {
    const { container } = renderPrompt(
      characterWith([
        { id: "m-cmd", name: "Commander's Strike", description: "", placement: "attackOption" },
        { id: "m-parry", name: "Parry", description: "", placement: "reaction" },
        { id: "m-foot", name: "Evasive Footwork", description: "", placement: "effect" },
      ]),
      "damage",
      14,
      9,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("a legacy maneuver without placement defaults to the damage section", () => {
    renderPrompt(characterWith([{ id: "m-legacy", name: "Old Trip", description: "" }]), "damage", null, 9);
    expect(screen.getByText("Add to Damage:")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Old Trip/ })).toBeInTheDocument();
  });

  it("hides the attack section when only damage maneuvers apply", () => {
    const { container } = renderPrompt(
      characterWith([{ id: "m-trip", name: "Trip Attack", description: "", placement: "damageRoll" }]),
      "attack",
      14,
      null,
    );
    // Attack was rolled but no attackRoll maneuvers → the attack card stays empty.
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the pool is exhausted", () => {
    const { container } = renderPrompt(
      characterWith([{ id: "m-trip", name: "Trip Attack", description: "", placement: "damageRoll" }], 0),
      "damage",
      14,
      9,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("multiple damage maneuvers: select + spend uses the chosen maneuver", async () => {
    const user = userEvent.setup();
    const { onRollsUpdated } = renderPrompt(
      characterWith([
        { id: "m-trip", name: "Trip Attack", description: "", placement: "damageRoll" },
        { id: "m-menace", name: "Menacing Attack", description: "", placement: "damageRoll" },
      ]),
      "damage",
      null,
      9,
    );

    await user.selectOptions(screen.getByRole("combobox", { name: "Select maneuver to add to damage" }), "Menacing Attack");
    await user.click(screen.getByRole("button", { name: /Spend d8/ }));

    await waitFor(() =>
      expect(castManeuverTransaction).toHaveBeenCalledWith("char-1", [
        { type: "castManeuver", entryId: "m-menace" },
      ]),
    );
    expect(onRollsUpdated).toHaveBeenCalledWith(null, 9 + SERVER_ROLL);
  });

  it("falls back to the first damage maneuver when the selection is stale", async () => {
    const user = userEvent.setup();
    renderPrompt(
      characterWith([
        { id: "m-trip", name: "Trip Attack", description: "", placement: "damageRoll" },
        { id: "m-menace", name: "Menacing Attack", description: "", placement: "damageRoll" },
      ]),
      "damage",
      null,
      9,
    );

    // Untouched select shows the fallback (first maneuver) and spends it.
    expect(screen.getByRole("combobox")).toHaveValue("Trip Attack");
    await user.click(screen.getByRole("button", { name: /Spend d8/ }));
    await waitFor(() =>
      expect(castManeuverTransaction).toHaveBeenCalledWith("char-1", [
        { type: "castManeuver", entryId: "m-trip" },
      ]),
    );
  });

  it("disables a single-damage-maneuver button after it has been spent", async () => {
    const user = userEvent.setup();
    renderPrompt(
      characterWith([{ id: "m-trip", name: "Trip Attack", description: "", placement: "damageRoll" }]),
      "damage",
      null,
      9,
    );

    const btn = screen.getByRole("button", { name: /Trip Attack/ });
    await user.click(btn);
    await waitFor(() => expect(btn).toBeDisabled());
  });
});
