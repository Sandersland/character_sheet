/**
 * Direct ShadowArtRow pins (#688) — previously covered only transitively via
 * ShadowArtsSection.test.tsx. Pins the flat focus cast gating, the name-prefix
 * strip, the concentration badges + replacement warning, the buff chip, and
 * the expandable description, ahead of the shared-row-shell extraction.
 */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import ShadowArtRow from "@/features/class/ShadowArtRow";
import type { CatalogShadowArt } from "@/types/character";

const DARKNESS: CatalogShadowArt = {
  id: "sa-darkness",
  name: "Shadow Arts: Darkness",
  description: "Magical darkness spreads from a point you choose.",
  minLevel: 3,
  cost: { kind: "pool", key: "focus", base: 1 },
  effect: {
    effectType: "utility",
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "none" },
    concentration: true,
  },
};

// Synthetic fixture exercising ShadowArtRow's generic buff-chip path (shared
// with Channel Divinity via catalogEffectSpec) — no current Shadow Art carries
// a buff (the 2014 Pass without Trace option is retired, #1246).
const BUFF_ART_FIXTURE: CatalogShadowArt = {
  id: "sa-test-buff",
  name: "Shadow Arts: Test Buff",
  description: "A synthetic buff art for row-shell coverage.",
  minLevel: 3,
  cost: { kind: "pool", key: "focus", base: 1 },
  effect: {
    effectType: "buff",
    damageType: null,
    attackType: null,
    saveAbility: null,
    saveEffect: null,
    scaling: { mode: "none" },
    concentration: true,
    buffTarget: "stealth",
    buffModifier: 10,
  },
};

function renderRow(over: Partial<Parameters<typeof ShadowArtRow>[0]> = {}) {
  const onCast = vi.fn();
  render(
    <ul>
      <ShadowArtRow
        art={DARKNESS}
        focusAvailable={4}
        busy={false}
        isConcentrating={false}
        concentratingOnName={null}
        onCast={onCast}
        {...over}
      />
    </ul>,
  );
  return { onCast };
}

describe("ShadowArtRow (#688)", () => {
  it("strips the 'Shadow Arts:' prefix and casts by id", async () => {
    const user = userEvent.setup();
    const { onCast } = renderRow();
    expect(screen.getByText("Darkness")).toBeInTheDocument();
    expect(screen.queryByText("Shadow Arts: Darkness")).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cast" }));
    expect(onCast).toHaveBeenCalledWith({ type: "castShadowArt", shadowArtId: "sa-darkness" });
  });

  it("disables Cast below the focus cost with the needs-N title", async () => {
    const user = userEvent.setup();
    const { onCast } = renderRow({ focusAvailable: 0 });
    const cast = screen.getByRole("button", { name: "Cast" });
    expect(cast).toBeDisabled();
    expect(cast).toHaveAttribute("title", "Not enough focus (needs 1)");
    await user.click(cast).catch(() => undefined);
    expect(onCast).not.toHaveBeenCalled();
  });

  it("shows the conc chip, and the active 'concentrating' chip when held", () => {
    renderRow();
    expect(screen.getByText("conc")).toBeInTheDocument();

    renderRow({ isConcentrating: true });
    expect(screen.getByText("concentrating")).toBeInTheDocument();
  });

  it("warns that casting replaces the current concentration", () => {
    renderRow({ concentratingOnName: "Fixture Bless" });
    expect(screen.getByRole("status")).toHaveTextContent("Casting replaces concentration on Fixture Bless.");
  });

  it("does not warn when this art IS the active concentration", () => {
    renderRow({ isConcentrating: true, concentratingOnName: "Darkness" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders the buff chip through skillLabel", () => {
    renderRow({ art: BUFF_ART_FIXTURE });
    expect(screen.getByText("+10 Stealth")).toBeInTheDocument();
  });

  it("expands to the description", async () => {
    const user = userEvent.setup();
    renderRow();
    const toggle = screen.getByRole("button", { name: /Darkness/ });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    expect(screen.getByText("Magical darkness spreads from a point you choose.")).toBeInTheDocument();
  });
});
