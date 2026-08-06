import { describe, it, expect } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import BannerVitals from "@/features/character-meta/BannerVitals";
import { RollProvider } from "@/features/dice/RollContext";
import { renderWithCharacter } from "@/test/renderWithCharacter";
import type { Character } from "@/types/character";

const mockCharacter: Character = {
  id: "char-1",
  ownerId: "user-1",
  rulesEdition: "EDITION_2024",
  rulesEditionLabel: "2024 rules",
  name: "Aria Swiftwind",
  race: "Elf",
  class: "Ranger",
  level: 4,
  experiencePoints: 2700,
  currentLevelThreshold: 2700,
  nextLevelThreshold: 6500,
  pendingLevelUps: 0,
  background: "Outlander",
  alignment: "Neutral Good",
  armorClass: 14,
  armorClassBreakdown: [
    { label: "Leather", value: 11 },
    { label: "Dex", value: 3 },
  ],
  initiativeBonus: 3,
  speed: 35,
  proficiencyBonus: 2,
  // Riders (#1316) are absent for a Ranger with none of these — no key at all.
  hitPoints: { current: 28, max: 36, temp: 0, deathSaves: { successes: 0, failures: 0 } },
  hitDice: { total: 4, die: "d10", spent: 0 },
  abilityScores: {
    strength: 12,
    dexterity: 16,
    constitution: 14,
    intelligence: 10,
    wisdom: 14,
    charisma: 10,
  },
  savingThrowProficiencies: ["strength", "dexterity"],
  skills: [],
  toolProficiencies: [],
  armorProficiencies: [],
  weaponProficiencies: [],
  inventory: [],
  offHandLocked: false,
  currency: { cp: 0, sp: 0, gp: 25, pp: 0 },
  carryCapacity: 180,
  carriedWeight: 0.5,
  attunementCap: 3,
  conditions: { active: [], exhaustion: 0 },
  exhaustionEffectText: "No exhaustion.",
  activeEffects: { buffs: [] },
  rollModifiers: [],
  unarmedStrike: {
    attackBonus: 3,
    damage: { count: 1, faces: 1, modifier: 1, damageType: "bludgeoning" },
  },
  improvisedWeapon: {
    attackBonus: 1,
    proficient: false,
    damage: { count: 1, faces: 4, modifier: 1, damageType: "bludgeoning" },
  },
  attacksPerAction: 1,
  // Served crit threshold (#1120). BannerVitals renders nothing crit-related,
  // but the field is required on the wire — same rationale as attackRows below.
  critRange: 20,
  // Served attack rows (#1434). BannerVitals renders none of them, but the field
  // is required on the wire, so the fixture carries the two always-present rows
  // rather than being weakened to `as unknown as Character`.
  attackRows: [
    {
      id: "unarmed",
      kind: "unarmed",
      name: "Unarmed Strike",
      attackSpec: { count: 1, faces: 20, modifier: 3 },
      damageSpec: { count: 1, faces: 1, modifier: 1 },
      damageType: "bludgeoning",
      magical: false,
      offHand: false,
      damageRiders: [],
    },
    {
      id: "improvised",
      kind: "improvised",
      name: "Improvised Weapon",
      attackSpec: { count: 1, faces: 20, modifier: 1 },
      damageSpec: { count: 1, faces: 4, modifier: 1 },
      damageType: "bludgeoning",
      magical: false,
      offHand: false,
      damageRiders: [],
    },
  ],
  advancements: [],
  advancementSlots: { total: 1, used: 0 },
  fightingStyleSlots: { total: 0, used: 0 },
  journal: [],
  speciesTraits: [],
};

// BannerVitals (and its nested ArmorClassBreakdown) reads useCurrentCharacter(),
// so every render seeds the cache and mounts CurrentCharacterProvider via
// renderWithCharacter.
function renderWithRoll() {
  return renderWithCharacter(
    <RollProvider>
      <BannerVitals />
    </RollProvider>,
    mockCharacter,
  );
}

describe("BannerVitals", () => {
  it("renders armor class as a disclosure button (no manual input)", () => {
    const { container } = renderWithRoll();
    expect(screen.getByText("14")).toBeInTheDocument();
    expect(container.querySelector("input")).toBeNull();
    expect(screen.getByRole("button", { name: "Armor Class breakdown" })).toBeInTheDocument();
  });

  it("clicking the AC tile opens the breakdown with labels, values, and total", async () => {
    const user = userEvent.setup();
    renderWithRoll();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    const dialog = screen.getByRole("dialog", { name: "Armor Class breakdown" });
    expect(dialog).toHaveTextContent("Leather");
    expect(dialog).toHaveTextContent("11"); // base part: plain number
    expect(dialog).toHaveTextContent("Dex");
    expect(dialog).toHaveTextContent("+3"); // later parts: formatted modifier
    expect(dialog).toHaveTextContent("Total");
    expect(dialog).toHaveTextContent("14");
  });

  it("Escape closes the breakdown popover", async () => {
    const user = userEvent.setup();
    renderWithRoll();
    await user.click(screen.getByRole("button", { name: "Armor Class breakdown" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders speed with ft suffix and proficiency as a formatted modifier", () => {
    renderWithRoll();
    expect(screen.getByText("35 ft")).toBeInTheDocument();
    expect(screen.getByText("+2")).toBeInTheDocument(); // proficiencyBonus=2
  });

  // #1085: HP left the header entirely (it lives in the Combat tab). The banner
  // is four self-labeled stat cards, no HP readout and no manage-HP entry point.
  it("renders no HP readout or manage-HP control in the header", () => {
    renderWithRoll();
    expect(screen.queryByText(/hit points/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /manage hit points/i })).not.toBeInTheDocument();
  });

  it("renders exactly four self-labeled stat cards: AC / Initiative / Speed / Proficiency", () => {
    renderWithRoll();
    expect(screen.getByText("Armor Class")).toBeInTheDocument();
    expect(screen.getByText("Initiative")).toBeInTheDocument();
    expect(screen.getByText("Speed")).toBeInTheDocument();
    expect(screen.getByText("Proficiency")).toBeInTheDocument();
  });
});
