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

// #1565: this section is reused for BOTH the class's package (default title/
// kind) and the background's own package (title="Background Equipment",
// kind="background") — the acceptance criterion is that the picker renders a
// background choice when the background HAS a package and renders nothing at
// all when it doesn't (Charlatan/Folk Hero/Noble, or a 2014 Criminal/Sage/
// Soldier — see BackgroundOption's own comment), same as a class with none.
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

  it("defaults to the \"Starting Equipment\" title and class kind", () => {
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
    expect(screen.getByRole("button", { name: "Class equipment package" })).toBeInTheDocument();
  });

  it("renders a distinct \"Background Equipment\" card, with the background-labeled toggle, when passed title/kind", () => {
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
    expect(screen.getByRole("button", { name: "Background equipment package" })).toBeInTheDocument();
  });
});
