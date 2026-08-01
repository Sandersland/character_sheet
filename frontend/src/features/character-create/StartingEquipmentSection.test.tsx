import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

import StartingEquipmentSection from "@/features/character-create/StartingEquipmentSection";
import { emptyPackageState } from "@/lib/startingEquipment";
import type { ClassStartingEquipment } from "@/types/character";

const PACKAGE: ClassStartingEquipment = {
  groups: [
    {
      label: "Equipment Group",
      options: [
        { label: "(A) 8 GP", gold: 8 },
        { label: "(B) 50 GP", gold: 50 },
      ],
    },
  ],
  gold: null,
};

// A package with BOTH modes (gold: not null) — the realistic shape for a
// 2014 class, used only to prove the toggle's kind-label still threads
// through Section -> Editor when the toggle actually renders (#1565 reviewer
// fix: PACKAGE above's gold:null, the realistic BACKGROUND shape, hides the
// toggle row entirely, so it can't exercise the label).
const PACKAGE_WITH_GOLD_ALT: ClassStartingEquipment = {
  ...PACKAGE,
  gold: { diceCount: 5, diceFaces: 4, multiplier: 10 },
};

// #1565: this section is reused for BOTH the class's package (default title/
// kind) and the background's own package (title="Background Equipment",
// kind="background") — the acceptance criterion is that the picker renders a
// background choice when the background HAS a package and renders nothing at
// all when it doesn't (any 2014 background but Acolyte and Folk Hero — see
// BackgroundOption's own comment), same as a class with none.
describe("StartingEquipmentSection — background reuse (#1565)", () => {
  it("renders nothing when startingEquipment is null (a background with no seeded package)", () => {
    render(
      <StartingEquipmentSection
        startingEquipment={null}
        value={{ mode: "package", selections: emptyPackageState(PACKAGE) }}
        catalog={[]}
        onChange={vi.fn()}
        selectedToolChoices={[]}
      />,
    );
    expect(screen.queryByRole("heading", { name: "Starting Equipment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Background Equipment" })).not.toBeInTheDocument();
  });

  it("defaults to the \"Starting Equipment\" title and class kind (no toggle row — this package has no gold alternative)", () => {
    render(
      <StartingEquipmentSection
        startingEquipment={PACKAGE}
        value={{ mode: "package", selections: emptyPackageState(PACKAGE) }}
        catalog={[]}
        onChange={vi.fn()}
        selectedToolChoices={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Starting Equipment" })).toBeInTheDocument();
    // #1565 reviewer fix: a one-mode package renders no toggle row at all.
    expect(screen.queryByRole("button", { name: "Class equipment package" })).not.toBeInTheDocument();
  });

  it("renders a distinct \"Background Equipment\" card when passed title/kind", () => {
    render(
      <StartingEquipmentSection
        title="Background Equipment"
        kind="background"
        startingEquipment={PACKAGE}
        value={{ mode: "package", selections: emptyPackageState(PACKAGE) }}
        catalog={[]}
        onChange={vi.fn()}
        selectedToolChoices={[]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Background Equipment" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Starting Equipment" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Background equipment package" })).not.toBeInTheDocument();
  });

  it("threads the background-labeled toggle through Section -> Editor on the rare package that DOES have a gold alternative", () => {
    render(
      <StartingEquipmentSection
        title="Background Equipment"
        kind="background"
        startingEquipment={PACKAGE_WITH_GOLD_ALT}
        value={{ mode: "package", selections: emptyPackageState(PACKAGE_WITH_GOLD_ALT) }}
        catalog={[]}
        onChange={vi.fn()}
        selectedToolChoices={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Background equipment package" })).toBeInTheDocument();
  });

  // The creation step mounts both editors at once, and a native radio group is
  // keyed by `name` across the WHOLE document — so a shared name would make
  // picking a background option clear the class one on screen while the draft
  // silently kept both (#1565). Asserting the names are disjoint is what pins
  // that; asserting on `checked` alone would not, since these radios are
  // React-controlled and re-render from state either way.
  it("namespaces each editor's radio group so two mounted editors stay independent", () => {
    const { container } = render(
      <>
        <StartingEquipmentSection
          startingEquipment={PACKAGE}
          value={{ mode: "package", selections: emptyPackageState(PACKAGE) }}
          catalog={[]}
          onChange={vi.fn()}
          selectedToolChoices={[]}
        />
        <StartingEquipmentSection
          title="Background Equipment"
          kind="background"
          startingEquipment={PACKAGE}
          value={{ mode: "package", selections: emptyPackageState(PACKAGE) }}
          catalog={[]}
          onChange={vi.fn()}
          selectedToolChoices={[]}
        />
      </>,
    );

    const names = [...container.querySelectorAll("input[type=radio]")].map((r) => r.getAttribute("name"));
    expect(names).toHaveLength(4);
    expect(new Set(names)).toEqual(new Set(["class-group-0", "background-group-0"]));
  });
});
