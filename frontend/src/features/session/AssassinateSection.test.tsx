import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import AssassinateSection from "@/features/session/AssassinateSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";
import type { ResolutionView } from "@/features/session/useResolution";

function makeCharacter(overrides: Partial<Character> = {}): Character {
  return { id: "char-1", ...overrides } as unknown as Character;
}

function makeView(overrides: Partial<ResolutionView> = {}): ResolutionView {
  return {
    source: "Dagger",
    steps: [],
    disabled: false,
    completed: false,
    readyToComplete: false,
    toHit: undefined,
    toHitRoll: null,
    attack: null,
    verdict: undefined,
    isCrit: false,
    attackChip: "",
    attackMode: "normal",
    save: undefined,
    effect: undefined,
    effectRoll: null,
    onRollToHit: vi.fn(),
    onCallMiss: vi.fn(),
    onCallCrit: vi.fn(),
    onRollEffect: vi.fn(),
    boostToHit: vi.fn(),
    onComplete: vi.fn(),
    ...overrides,
  } as unknown as ResolutionView;
}

describe("AssassinateSection (#1526)", () => {
  it("renders nothing when the character has no Assassinate rider (absent, #1316)", () => {
    const character = makeCharacter({ assassinate: undefined });
    const { container } = renderWithCharacter(
      <AssassinateSection resolutionView={makeView()} surprised={false} onSurprisedChange={vi.fn()} />,
      character,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders the toggle when the character has the Assassinate rider", () => {
    const character = makeCharacter({ assassinate: true });
    renderWithCharacter(
      <AssassinateSection resolutionView={makeView()} surprised={false} onSurprisedChange={vi.fn()} />,
      character,
    );
    expect(screen.getByLabelText(/target is surprised/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/target is surprised/i)).not.toBeChecked();
  });

  it("checking the toggle calls onSurprisedChange(true)", async () => {
    const character = makeCharacter({ assassinate: true });
    const onSurprisedChange = vi.fn();
    renderWithCharacter(
      <AssassinateSection resolutionView={makeView()} surprised={false} onSurprisedChange={onSurprisedChange} />,
      character,
    );
    await userEvent.click(screen.getByLabelText(/target is surprised/i));
    expect(onSurprisedChange).toHaveBeenCalledWith(true);
  });

  it("does NOT call onCallCrit while no to-hit roll exists yet", () => {
    const character = makeCharacter({ assassinate: true });
    const view = makeView({ toHitRoll: null, verdict: undefined });
    renderWithCharacter(
      <AssassinateSection resolutionView={view} surprised={true} onSurprisedChange={vi.fn()} />,
      character,
    );
    expect(view.onCallCrit).not.toHaveBeenCalled();
  });

  it("calls onCallCrit once a to-hit roll lands and the verdict hasn't settled", () => {
    const character = makeCharacter({ assassinate: true });
    const rollResult = { total: 18, dice: [] } as unknown as ResolutionView["toHitRoll"];
    const view = makeView({ toHitRoll: rollResult, verdict: undefined });
    renderWithCharacter(
      <AssassinateSection resolutionView={view} surprised={true} onSurprisedChange={vi.fn()} />,
      character,
    );
    expect(view.onCallCrit).toHaveBeenCalledTimes(1);
  });

  it("does NOT call onCallCrit when the swing already resolved to a miss (surprise cannot upgrade a miss)", () => {
    const character = makeCharacter({ assassinate: true });
    const rollResult = { total: 3, dice: [] } as unknown as ResolutionView["toHitRoll"];
    const view = makeView({ toHitRoll: rollResult, verdict: "miss" });
    renderWithCharacter(
      <AssassinateSection resolutionView={view} surprised={true} onSurprisedChange={vi.fn()} />,
      character,
    );
    expect(view.onCallCrit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/target is surprised/i)).toBeDisabled();
  });

  it("does not call onCallCrit at all when the toggle itself is unchecked", () => {
    const character = makeCharacter({ assassinate: true });
    const rollResult = { total: 18, dice: [] } as unknown as ResolutionView["toHitRoll"];
    const view = makeView({ toHitRoll: rollResult, verdict: undefined });
    renderWithCharacter(
      <AssassinateSection resolutionView={view} surprised={false} onSurprisedChange={vi.fn()} />,
      character,
    );
    expect(view.onCallCrit).not.toHaveBeenCalled();
  });
});
