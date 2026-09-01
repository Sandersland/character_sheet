import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import HomebrewSpellEffectFields from "@/features/spells/HomebrewSpellEffectFields";
import { BLANK_HOMEBREW_SPELL } from "@/lib/homebrewSpell";
import type { HomebrewSpellInput } from "@/types/character";

function draft(over: Partial<HomebrewSpellInput> = {}): HomebrewSpellInput {
  return { ...BLANK_HOMEBREW_SPELL, ...over };
}

describe("HomebrewSpellEffectFields — upcast-instances/level gating (#1984)", () => {
  it("hides upcast instances/level when instanceCount is unset", () => {
    render(<HomebrewSpellEffectFields draft={draft()} update={vi.fn()} />);
    expect(screen.queryByLabelText(/upcast instances.level/i)).not.toBeInTheDocument();
  });

  it("hides upcast instances/level when instanceCount is exactly 1", () => {
    render(<HomebrewSpellEffectFields draft={draft({ instanceCount: 1 })} update={vi.fn()} />);
    expect(screen.queryByLabelText(/upcast instances.level/i)).not.toBeInTheDocument();
  });

  it("shows upcast instances/level once instanceCount is greater than 1, alongside upcast dice/level", () => {
    render(<HomebrewSpellEffectFields draft={draft({ instanceCount: 3 })} update={vi.fn()} />);
    expect(screen.getByLabelText(/upcast instances.level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/upcast dice.level/i)).toBeInTheDocument();
  });
});
