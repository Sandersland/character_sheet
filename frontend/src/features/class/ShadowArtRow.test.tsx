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

// Synthetic fixture exercising the buff-chip path — no current Shadow Art carries a buff.
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
        poolAvailable={4}
        poolLabel="focus"
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

  it("disables Cast below the pool cost with the needs-N title", async () => {
    const user = userEvent.setup();
    const { onCast } = renderRow({ poolAvailable: 0 });
    const cast = screen.getByRole("button", { name: "Cast" });
    expect(cast).toBeDisabled();
    expect(cast).toHaveAttribute("title", "Not enough focus (needs 1)");
    await user.click(cast).catch(() => undefined);
    expect(onCast).not.toHaveBeenCalled();
  });

  // poolLabel is caller-supplied, never a hardcoded "focus" literal inside this row.
  it("renders the caller-supplied pool label (ki for a 2014 Way of Shadow row)", () => {
    renderRow({
      art: { ...DARKNESS, cost: { kind: "pool", key: "ki", base: 2 } },
      poolAvailable: 4,
      poolLabel: "Ki Points",
    });
    expect(screen.getByText("2 Ki Points")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cast" })).toHaveAttribute(
      "title",
      "Cast Darkness (2 Ki Points)",
    );
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
