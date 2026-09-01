import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import SpellDetailCard, { type SpellDetailView } from "@/features/spells/SpellDetailCard";
import { axe } from "@/test/axe";

// jsdom's matchMedia reports matches:false (mobile); this stubs a min-width match for desktop's instant close path.
function stubDesktop() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("min-width"),
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

const holdPerson: SpellDetailView = {
  name: "Hold Person",
  level: 2,
  school: "enchantment",
  castingTime: "1 action",
  range: "60 ft.",
  duration: "Conc., 1 min.",
  description: "Choose a Humanoid you can see within range or be Paralyzed for the duration.",
  concentration: true,
  ritual: false,
  components: { verbal: true, somatic: true, material: true },
  attackType: "save",
  saveAbility: "wisdom",
  saveEffect: "none",
  upcastDicePerLevel: null,
};

function cta(over: Partial<{ label: string; disabled: boolean; onPress: () => void }> = {}) {
  return { label: "Learn Hold Person · 1 of 2", disabled: false, onPress: vi.fn(), ...over };
}

describe("SpellDetailCard", () => {
  it("renders the name, meta, full description and the stat grid", () => {
    render(<SpellDetailCard spell={holdPerson} cta={cta()} onClose={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Hold Person" })).toBeInTheDocument();
    expect(screen.getByText(/or be Paralyzed for the duration/)).toBeInTheDocument();
    expect(screen.getByText("Casting time")).toBeInTheDocument();
    expect(screen.getByText("Range")).toBeInTheDocument();
    expect(screen.getByText("Components")).toBeInTheDocument();
    expect(screen.getByText("Duration")).toBeInTheDocument();
    expect(screen.getByText("V, S, M")).toBeInTheDocument();
    expect(screen.getByText("Conc., 1 min.")).toBeInTheDocument();
  });

  it("shows a Conc badge for a concentration spell", () => {
    render(<SpellDetailCard spell={holdPerson} cta={cta()} onClose={vi.fn()} />);
    expect(screen.getByText("Conc")).toBeInTheDocument();
  });

  it("renders the save pill via abilityAbbr, never the raw ability key", () => {
    render(<SpellDetailCard spell={holdPerson} cta={cta()} onClose={vi.fn()} />);
    expect(screen.getByText(/WIS save/)).toBeInTheDocument();
    expect(screen.queryByText(/wisdom/)).not.toBeInTheDocument();
  });

  it("shows the upcast note only when upcastDicePerLevel is set", () => {
    const { rerender } = render(<SpellDetailCard spell={holdPerson} cta={cta()} onClose={vi.fn()} />);
    expect(screen.queryByText(/Upcast:/)).not.toBeInTheDocument();

    const fireball: SpellDetailView = {
      ...holdPerson,
      name: "Fireball",
      school: "evocation",
      concentration: false,
      attackType: "save",
      saveAbility: "dexterity",
      effectKind: "damage",
      effectDiceCount: 8,
      effectDiceFaces: 6,
      damageType: "fire",
      upcastDicePerLevel: 1,
    };
    rerender(<SpellDetailCard spell={fireball} cta={cta()} onClose={vi.fn()} />);
    expect(screen.getByText(/Upcast:/)).toBeInTheDocument();
  });

  it("prefixes the effect pill with 'N × ' for a multi-instance spell (#1981/#1984)", () => {
    const scorchingRay: SpellDetailView = {
      ...holdPerson,
      name: "Scorching Ray",
      school: "evocation",
      concentration: false,
      attackType: "attack",
      effectKind: "damage",
      effectDiceCount: 2,
      effectDiceFaces: 6,
      damageType: "fire",
      instanceCount: 3,
    };
    render(<SpellDetailCard spell={scorchingRay} cta={cta()} onClose={vi.fn()} />);
    expect(screen.getByText(/3 × 2d6/)).toBeInTheDocument();
  });

  it("shows instance-upcast phrasing when upcastInstancesPerLevel is set", () => {
    const scorchingRay: SpellDetailView = {
      ...holdPerson,
      name: "Scorching Ray",
      level: 2,
      school: "evocation",
      concentration: false,
      attackType: "attack",
      effectKind: "damage",
      effectDiceCount: 2,
      effectDiceFaces: 6,
      damageType: "fire",
      instanceCount: 3,
      upcastInstancesPerLevel: 1,
    };
    render(<SpellDetailCard spell={scorchingRay} cta={cta()} onClose={vi.fn()} />);
    expect(screen.getByText(/\+1 instance per slot level above 2/)).toBeInTheDocument();
  });

  it("renders the CTA label, honors disabled, and fires onPress", async () => {
    const onPress = vi.fn();
    const { rerender } = render(
      <SpellDetailCard spell={holdPerson} cta={cta({ disabled: true, onPress })} onClose={vi.fn()} />,
    );
    const button = screen.getByRole("button", { name: /Learn Hold Person/ });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();

    rerender(<SpellDetailCard spell={holdPerson} cta={cta({ onPress })} onClose={vi.fn()} />);
    await userEvent.click(screen.getByRole("button", { name: /Learn Hold Person/ }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape", async () => {
    stubDesktop();
    const onClose = vi.fn();
    render(<SpellDetailCard spell={holdPerson} cta={cta()} onClose={onClose} />);
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("has no axe violations", async () => {
    const { baseElement } = render(<SpellDetailCard spell={holdPerson} cta={cta()} onClose={vi.fn()} />);
    expect(await axe(baseElement)).toHaveNoViolations();
  });
});
