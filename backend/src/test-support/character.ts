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

// Cascade-deleted with its owner (Character.owner onDelete: Cascade), so a test that cleans up its users needs no separate character cleanup.
export async function createTestCharacter(
  ownerId: string,
  opts: {
    id?: string;
    edition?: RulesEdition;
    name?: string;
    campaignId?: string;
    hitPoints?: { current: number; max: number; temp: number };
  } = {},
): Promise<string> {
  const character = await prisma.character.create({
    data: {
      ...BASE_CHARACTER,
      // `id: undefined` lets Prisma fall back to the uuid default — pass it only when a test needs a stable fixture id.
      id: opts.id,
      name: opts.name ?? "Test Author Character",
      ownerId,
      rulesEdition: opts.edition ?? "EDITION_2024",
      campaignId: opts.campaignId,
      hitPoints: opts.hitPoints ?? BASE_CHARACTER.hitPoints,
    },
  });
  return character.id;
}
