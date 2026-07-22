import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import CloakOfShadowsSection from "@/features/class/CloakOfShadowsSection";
import type { Character, ConditionEntry } from "@/types/character";

function makeCharacter(active: ConditionEntry[] = []): Character {
  return {
    id: "char-1",
    class: "Monk",
    level: 17,
    conditions: { active, exhaustion: 0 },
  } as unknown as Character;
}

function renderSection(character: Character, props: Partial<React.ComponentProps<typeof CloakOfShadowsSection>> = {}) {
  const onActivate = vi.fn();
  render(<CloakOfShadowsSection character={character} focusAvailable={3} busy={false} onActivate={onActivate} {...props} />);
  return { onActivate };
}

describe("CloakOfShadowsSection", () => {
  it("offers the activation control and shows the 3-focus cost + break-condition reminder", () => {
    renderSection(makeCharacter());
    expect(screen.getByRole("button", { name: "Become Invisible" })).toBeInTheDocument();
    expect(screen.getByText(/Spend 3 focus/)).toBeInTheDocument();
    expect(screen.getByText(/Ends early if you attack or cast a spell/)).toBeInTheDocument();
  });

  it("fires onActivate when the button is clicked", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderSection(makeCharacter());
    await user.click(screen.getByRole("button", { name: "Become Invisible" }));
    expect(onActivate).toHaveBeenCalledTimes(1);
  });

  it("replaces the button with an active note when already invisible", () => {
    const invisible: ConditionEntry = { key: "invisible", source: "Cloak of Shadows", appliedAt: new Date().toISOString() };
    const { onActivate } = renderSection(makeCharacter([invisible]));
    expect(screen.queryByRole("button", { name: "Become Invisible" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/Invisible/);
    expect(onActivate).not.toHaveBeenCalled();
  });

  it("disables the activation control while busy", () => {
    renderSection(makeCharacter(), { busy: true });
    expect(screen.getByRole("button", { name: "Become Invisible" })).toBeDisabled();
  });

  it("disables the activation control below 3 focus", async () => {
    const user = userEvent.setup();
    const { onActivate } = renderSection(makeCharacter(), { focusAvailable: 2 });
    const button = screen.getByRole("button", { name: "Become Invisible" });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "Not enough focus (needs 3)");
    await user.click(button).catch(() => undefined);
    expect(onActivate).not.toHaveBeenCalled();
  });
});
