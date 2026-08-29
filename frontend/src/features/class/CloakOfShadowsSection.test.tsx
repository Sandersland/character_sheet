import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CloakOfShadowsSection from "@/features/class/CloakOfShadowsSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { AvailableAction, Character, ConditionEntry } from "@/types/character";

const WARRIOR_OF_SHADOW_ACTION: AvailableAction = {
  key: "cloakOfShadows",
  name: "Cloak of Shadows",
  cost: "action",
  enabled: true,
  reminder:
    "Magic action, entirely within dim light or darkness: spend 3 focus to become invisible and move through creatures/objects as difficult terrain for 1 minute (or until incapacitated, or you end your turn in bright light). Flurry of Blows costs no focus while it lasts.",
};

// The 2014 Way of Shadow's Cloak of Shadows served row carries no resourceKey,
// so `enabled` is always true and `disabledReason` never appears (#1738).
const WAY_OF_SHADOW_ACTION: AvailableAction = {
  key: "cloakOfShadows",
  name: "Cloak of Shadows",
  cost: "action",
  enabled: true,
  reminder:
    "While in dim light or darkness, use your action to become invisible; you remain invisible until you make an attack, cast a spell, or are in an area of bright light. No ki cost, no duration cap.",
};

function makeCharacter(
  active: ConditionEntry[] = [],
  action: AvailableAction | undefined = WARRIOR_OF_SHADOW_ACTION,
): Character {
  return {
    id: "char-1",
    class: "Monk",
    level: 17,
    conditions: { active, exhaustion: 0 },
    availableActions: action ? [action] : [],
  } as unknown as Character;
}

function renderSection(character: Character, props: Partial<React.ComponentProps<typeof CloakOfShadowsSection>> = {}) {
  const onActivate = vi.fn();
  renderWithCharacter(
    <CloakOfShadowsSection busy={false} onActivate={onActivate} {...props} />,
    character,
  );
  return { onActivate };
}

describe("CloakOfShadowsSection", () => {
  it("offers the activation control and shows the served reminder text", () => {
    renderSection(makeCharacter());
    expect(screen.getByRole("button", { name: "Become Invisible" })).toBeInTheDocument();
    expect(screen.getByText(/spend 3 focus/)).toBeInTheDocument();
    expect(screen.getByText(/Flurry of Blows costs no focus/)).toBeInTheDocument();
  });

  it("fires onActivate when the button is clicked", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderSection(makeCharacter());
    await user.click(screen.getByRole("button", { name: "Become Invisible" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("replaces the button with an active note when already invisible from Cloak of Shadows", () => {
    const invisible: ConditionEntry = { key: "invisible", source: "Cloak of Shadows", appliedAt: new Date().toISOString() };
    const { onActivate } = renderSection(makeCharacter([invisible]));
    expect(screen.queryByRole("button", { name: "Become Invisible" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Invisible/);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("keeps offering the activation control when invisible from a DIFFERENT source", () => {
    const invisibleFromSpell: ConditionEntry = { key: "invisible", source: "Invisibility", appliedAt: new Date().toISOString() };
    renderSection(makeCharacter([invisibleFromSpell]));
    const button = screen.getByRole("button", { name: "Become Invisible" });
    expect(button).not.toBeDisabled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders no reminder paragraph when the served row omits reminder", () => {
    const actionWithoutReminder: AvailableAction = { ...WARRIOR_OF_SHADOW_ACTION, reminder: undefined };
    renderSection(makeCharacter([], actionWithoutReminder));
    expect(screen.queryByText(/focus/)).not.toBeInTheDocument();
  });

  it("disables the activation control while busy", () => {
    renderSection(makeCharacter(), { busy: true });
    expect(screen.getByRole("button", { name: "Become Invisible" })).toBeDisabled();
  });

  it("disables the activation control when the served row reports not enough focus", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderSection(
      makeCharacter([], { ...WARRIOR_OF_SHADOW_ACTION, enabled: false, disabledReason: "Need 3 focus, have 2" }),
    );
    const button = screen.getByRole("button", { name: "Become Invisible" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Need 3 focus, have 2");
    await user.click(button).catch(() => undefined);
    expect(onActivate).not.toHaveBeenCalled();
  });

  describe("2014 Way of Shadow (#1738)", () => {
    it("shows the free/no-duration-cap reminder and stays enabled with no cost gate", () => {
      renderSection(makeCharacter([], WAY_OF_SHADOW_ACTION));
      const button = screen.getByRole("button", { name: "Become Invisible" });
      expect(button).not.toBeDisabled();
      expect(button).toHaveAttribute("title", "Become invisible");
      expect(screen.getByText(/No ki cost, no duration cap/)).toBeInTheDocument();
      expect(screen.queryByText(/spend 3 focus/)).not.toBeInTheDocument();
    });

    it("fires onActivate when clicked", async () => {
      const user = userEvent.setup();
      const { onActivate } = renderSection(makeCharacter([], WAY_OF_SHADOW_ACTION));
      await user.click(screen.getByRole("button", { name: "Become Invisible" }));
      expect(onActivate).toHaveBeenCalledTimes(1);
    });
  });
});
