import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShadowArtsSection from "@/features/class/ShadowArtsSection";
import * as client from "@/api/client";
import type { CatalogShadowArt, Character } from "@/types/character";

vi.mock("@/api/client", () => ({ fetchShadowArts: vi.fn() }));

const baseEffect = {
  damageType: null,
  attackType: null,
  saveAbility: null,
  saveEffect: null,
  scaling: { mode: "none" as const },
  buffTarget: null,
  buffModifier: null,
};

// 2024 rewrite (#1246): Shadow Arts is a single 1-focus Darkness cast — the
// 2014 4-spell menu (Silence/Pass without Trace/Darkvision) is retired.
const CATALOG: CatalogShadowArt[] = [
  {
    id: "darkness",
    name: "Shadow Arts: Darkness",
    description: "Cast darkness.",
    minLevel: 3,
    cost: { kind: "pool", key: "focus", base: 1 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
];

function makeCharacter(focusRemaining: number, concentratingOn: { entryId: string; spellName: string } | null = null): Character {
  return {
    id: "char-1",
    class: "Monk",
    level: 3,
    resources: {
      features: [],
      shadowArtsAvailable: true,
      pools: [{ key: "focus", label: "Focus", total: 3, recharge: "shortRest", used: 3 - focusRemaining, remaining: focusRemaining }],
      maneuversKnown: [],
      toolProficienciesKnown: [],
    },
    spellcasting: concentratingOn ? { concentratingOn } : undefined,
  } as unknown as Character;
}

function renderSection(character: Character, props: Partial<React.ComponentProps<typeof ShadowArtsSection>> = {}) {
  const onCast = vi.fn();
  render(<ShadowArtsSection character={character} busy={false} onCast={onCast} {...props} />);
  return { onCast };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchShadowArts).mockResolvedValue(CATALOG);
});

describe("ShadowArtsSection", () => {
  it("lists Darkness at a flat 1-focus cost with focus remaining", async () => {
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    expect(screen.getByText(/Cast Darkness for 1 focus/)).toBeInTheDocument();
    // Focus remaining surfaced.
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("casts Darkness as a castShadowArt op", async () => {
    const user = userEvent.setup();
    const { onCast } = renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());

    const row = screen.getByText("Darkness").closest("li")!;
    await user.click(within(row).getByRole("button", { name: "Cast" }));

    expect(onCast).toHaveBeenCalledWith({ type: "castShadowArt", shadowArtId: "darkness" });
  });

  it("disables Cast when the character can't afford 1 focus", async () => {
    renderSection(makeCharacter(0));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    const row = screen.getByText("Darkness").closest("li")!;
    expect(within(row).getByRole("button", { name: "Cast" })).toBeDisabled();
  });

  it("marks Darkness concentrating and surfaces the current concentration handoff", async () => {
    // The backend stamps a Shadow Art's concentration entryId with the shadow-art: prefix.
    renderSection(makeCharacter(3, { entryId: "shadow-art:darkness", spellName: "Shadow Arts: Darkness" }));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());

    const darknessRow = screen.getByText("Darkness").closest("li")!;
    expect(within(darknessRow).getByText("concentrating")).toBeInTheDocument();

    // Handoff banner names the current concentration.
    expect(screen.getByText(/Concentrating on/)).toBeInTheDocument();
  });

  it("warns that casting replaces a DIFFERENT active concentration", async () => {
    renderSection(makeCharacter(3, { entryId: "spellbook:bless", spellName: "Bless" }));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    const darknessRow = screen.getByText("Darkness").closest("li")!;
    expect(within(darknessRow).getByText(/Casting replaces concentration on/)).toBeInTheDocument();
  });

  it("surfaces a catalog load error", async () => {
    vi.mocked(client.fetchShadowArts).mockRejectedValue(new Error("boom"));
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText(/Couldn't load Shadow Arts/)).toBeInTheDocument());
  });
});
