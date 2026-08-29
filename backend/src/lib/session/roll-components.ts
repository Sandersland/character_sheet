import { z } from "zod";

// .strict() rejects unknown keys: these persist verbatim into a durable event log, so an extra key must 400, not ride along.
export const attackComponentsSchema = z
  .object({
    abilityMod: z.number().finite(),
    proficiencyBonus: z.number().finite(),
    rangedBonus: z.number().finite(),
    attackRollBonus: z.number().finite(),
    ability: z.string().optional(),
  })
  .strict();

export const damageComponentsSchema = z
  .object({
    abilityMod: z.number().finite(),
    meleeDamageBonus: z.number().finite(),
    ability: z.string().optional(),
  })
  .strict();
