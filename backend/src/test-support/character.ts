import { prisma } from "@/lib/core/prisma.js";
import type { RulesEdition } from "@/lib/rules/edition.js";

const BASE_CHARACTER = {
  alignment: "Neutral",
  experiencePoints: 0,
  initiativeBonus: 0,
  speed: 30,
  hitPoints: { current: 10, max: 10, temp: 0 },
  hitDice: { total: 1, die: "d8" },
  abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
  savingThrowProficiencies: [],
  skills: [],
  toolProficiencies: [],
  currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
};

// Minimal persisted character for tests that only need an owned row of a given
// edition — e.g. authoring a homebrew spell, whose edition the create endpoint
// derives from the authoring character (#1819). Cascade-deleted with its owner
// (Character.owner onDelete: Cascade), so a test that cleans up its users needs
// no separate character cleanup.
export async function createTestCharacter(
  ownerId: string,
  opts: { edition?: RulesEdition; name?: string; campaignId?: string } = {},
): Promise<string> {
  const character = await prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      name: opts.name ?? "Test Author Character",
      ownerId,
      rulesEdition: opts.edition ?? "EDITION_2024",
      campaignId: opts.campaignId,
    },
  });
  return character.id;
}
