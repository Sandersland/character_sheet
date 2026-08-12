import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShadowArtsSection from "@/features/class/ShadowArtsSection";
import { renderWithCharacter } from "@/test/renderWithCharacter";
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

// 2024 rewrite (#1246): Shadow Arts is a single 1-focus Darkness cast.
const WARRIOR_OF_SHADOW_CATALOG: CatalogShadowArt[] = [
  {
    id: "darkness",
    name: "Shadow Arts: Darkness",
    description: "Cast darkness.",
    minLevel: 3,
    cost: { kind: "pool", key: "focus", base: 1 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
];

// 2014 Way of Shadow (PHB'14 pp.79-80, #1502/#1738): the four-spell 2-ki
// menu — Darkness/Darkvision/Pass without Trace/Silence. Only Darkvision
// doesn't concentrate.
const WAY_OF_SHADOW_CATALOG: CatalogShadowArt[] = [
  {
    id: "sa-darkness",
    name: "Shadow Arts: Darkness",
    description: "Cast darkness.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
  {
    id: "sa-darkvision",
    name: "Shadow Arts: Darkvision",
    description: "Cast darkvision.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: false, ...baseEffect },
  },
  {
    id: "sa-pwt",
    name: "Shadow Arts: Pass without Trace",
    description: "Cast pass without trace.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
  {
    id: "sa-silence",
    name: "Shadow Arts: Silence",
    description: "Cast silence.",
    minLevel: 3,
    cost: { kind: "pool", key: "ki", base: 2 },
    effect: { effectType: "utility", concentration: true, ...baseEffect },
  },
];

function makeCharacter(
  poolRemaining: number,
  concentratingOn: { entryId: string; spellName: string } | null = null,
  options: { edition?: Character["rulesEdition"]; poolKey?: string; poolLabel?: string } = {},
): Character {
  const poolKey = options.poolKey ?? "focus";
  const poolLabel = options.poolLabel ?? "Focus";
  // total must never be < remaining (an impossible pool state) — every fixture
  // call site here wants a monk with at least 3 total, so this only grows for
  // a poolRemaining bigger than that (the 2014 ki-menu tests, remaining: 4).
  const poolTotal = Math.max(poolRemaining, 3);
  return {
    id: "char-1",
    class: "Monk",
    level: 3,
    rulesEdition: options.edition ?? "EDITION_2024",
    resources: {
      features: [],
      pools: [{ key: poolKey, label: poolLabel, total: poolTotal, recharge: "shortRest", used: poolTotal - poolRemaining, remaining: poolRemaining }],
      maneuversKnown: [],
      toolProficienciesKnown: [],
    },
    spellcasting: concentratingOn ? { concentratingOn } : undefined,
  } as unknown as Character;
}

// ShadowArtsSection reads useCurrentCharacter(), so every render seeds the
// cache and mounts CurrentCharacterProvider via renderWithCharacter.
function renderSection(character: Character, props: Partial<React.ComponentProps<typeof ShadowArtsSection>> = {}) {
  const onCast = vi.fn();
  renderWithCharacter(<ShadowArtsSection busy={false} onCast={onCast} {...props} />, character);
  return { onCast };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(client.fetchShadowArts).mockResolvedValue(WARRIOR_OF_SHADOW_CATALOG);
});

describe("ShadowArtsSection", () => {
  it("lists Darkness at a flat 1-focus cost with focus remaining", async () => {
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    expect(screen.getByText("1 Focus")).toBeInTheDocument();
    // Focus remaining surfaced through the served DerivedResource.label.
    expect(screen.getByText(/Focus remaining/)).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    // The catalog is edition-scoped server-side (#1412) — a hardcoded edition
    // would render identically here, so the argument itself is the assertion.
    expect(client.fetchShadowArts).toHaveBeenCalledWith("EDITION_2024");
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

  it("recovers from a transient load error via the Retry button, without a page reload", async () => {
    const user = userEvent.setup();
    vi.mocked(client.fetchShadowArts).mockRejectedValueOnce(new Error("boom"));
    renderSection(makeCharacter(3));
    await waitFor(() => expect(screen.getByText(/Couldn't load Shadow Arts/)).toBeInTheDocument());

    vi.mocked(client.fetchShadowArts).mockResolvedValueOnce(WARRIOR_OF_SHADOW_CATALOG);
    await user.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
    expect(screen.queryByText(/Couldn't load Shadow Arts/)).not.toBeInTheDocument();
  });

  // #1738: 2014 Way of Shadow gets the real four-spell 2-ki menu — the same
  // component, driven entirely by the edition-scoped catalog response.
  describe("2014 Way of Shadow (#1738)", () => {
    beforeEach(() => {
      vi.mocked(client.fetchShadowArts).mockResolvedValue(WAY_OF_SHADOW_CATALOG);
    });

    it("lists all four spells at 2 ki each, with Ki Points remaining", async () => {
      renderSection(makeCharacter(4, null, { edition: "EDITION_2014", poolKey: "ki", poolLabel: "Ki Points" }));
      await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());

      for (const name of ["Darkness", "Darkvision", "Pass without Trace", "Silence"]) {
        expect(screen.getByText(name)).toBeInTheDocument();
      }
      expect(screen.getAllByText("2 Ki Points")).toHaveLength(4);
      expect(screen.getByText(/Ki Points remaining/)).toBeInTheDocument();
      expect(client.fetchShadowArts).toHaveBeenCalledWith("EDITION_2014");
    });

    it("casts a non-Darkness spell (Silence) as a castShadowArt op by its own id", async () => {
      const user = userEvent.setup();
      const { onCast } = renderSection(makeCharacter(4, null, { edition: "EDITION_2014", poolKey: "ki", poolLabel: "Ki Points" }));
      await waitFor(() => expect(screen.getByText("Silence")).toBeInTheDocument());

      const row = screen.getByText("Silence").closest("li")!;
      await user.click(within(row).getByRole("button", { name: "Cast" }));

      expect(onCast).toHaveBeenCalledWith({ type: "castShadowArt", shadowArtId: "sa-silence" });
    });

    it("disables every Cast button below 2 ki", async () => {
      renderSection(makeCharacter(1, null, { edition: "EDITION_2014", poolKey: "ki", poolLabel: "Ki Points" }));
      await waitFor(() => expect(screen.getByText("Darkness")).toBeInTheDocument());
      for (const button of screen.getAllByRole("button", { name: "Cast" })) {
        expect(button).toBeDisabled();
      }
    });
  });
});
