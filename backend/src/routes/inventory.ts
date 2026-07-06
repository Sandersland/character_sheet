import { Router } from "express";
import { z } from "zod";

import {
  applyInventoryOperations,
  InsufficientCurrencyError,
  InvalidInventoryOperationError,
} from "../lib/inventory.js";
import { assertCharacterAccess } from "../lib/auth/access.js";
import { prisma } from "../lib/prisma.js";
import { characterInclude } from "../lib/character-include.js";
import { serializeCharacter } from "../lib/character-serialize.js";

export const inventoryRouter = Router();

const currencySchema = z.object({
  cp: z.number().int(),
  sp: z.number().int(),
  gp: z.number().int(),
  pp: z.number().int(),
});

const weaponDetailSchema = z.object({
  damageDiceCount: z.number().int().positive(),
  damageDiceFaces: z.number().int().positive(),
  damageModifier: z.number().int().optional(),
  damageType: z.string().min(1),
  versatileDiceCount: z.number().int().positive().optional(),
  versatileDiceFaces: z.number().int().positive().optional(),
  finesse: z.boolean().optional(),
  light: z.boolean().optional(),
  heavy: z.boolean().optional(),
  twoHanded: z.boolean().optional(),
  reach: z.boolean().optional(),
  thrown: z.boolean().optional(),
  ammunition: z.boolean().optional(),
  rangeNormal: z.number().int().positive().optional(),
  rangeLong: z.number().int().positive().optional(),
});

const armorDetailSchema = z.object({
  armorCategory: z.enum(["light", "medium", "heavy", "shield"]),
  baseArmorClass: z.number().int(),
  dexModifierApplies: z.boolean().optional(),
  dexModifierMax: z.number().int().optional(),
  stealthDisadvantage: z.boolean().optional(),
  strengthRequirement: z.number().int().optional(),
});

const consumableDetailSchema = z.object({
  effectDiceCount: z.number().int().positive().optional(),
  effectDiceFaces: z.number().int().positive().optional(),
  effectModifier: z.number().int().optional(),
  effectDescription: z.string().optional(),
});

// Discriminated on `category` so a weapon/armor custom item is required to
// carry the minimal mechanical fields the matching *Detail table's columns
// are NOT NULL for — see schema.prisma's ItemWeaponDetail/ItemArmorDetail.
// consumable/gear have no such requirement.
const customItemSchema = z.discriminatedUnion("category", [
  z.object({
    category: z.literal("weapon"),
    name: z.string().min(1),
    weight: z.number().nonnegative().optional(),
    cost: currencySchema.optional(),
    description: z.string().optional(),
    weapon: weaponDetailSchema,
  }),
  z.object({
    category: z.literal("armor"),
    name: z.string().min(1),
    weight: z.number().nonnegative().optional(),
    cost: currencySchema.optional(),
    description: z.string().optional(),
    armor: armorDetailSchema,
  }),
  z.object({
    category: z.literal("consumable"),
    name: z.string().min(1),
    weight: z.number().nonnegative().optional(),
    cost: currencySchema.optional(),
    description: z.string().optional(),
    consumable: consumableDetailSchema.optional(),
  }),
  z.object({
    category: z.literal("gear"),
    name: z.string().min(1),
    weight: z.number().nonnegative().optional(),
    cost: currencySchema.optional(),
    description: z.string().optional(),
  }),
]);

const acquireOpSchema = z
  .object({
    type: z.literal("acquire"),
    itemId: z.string().optional(),
    custom: customItemSchema.optional(),
    quantity: z.number().int().positive().optional(),
    equipped: z.boolean().optional(),
    notes: z.string().optional(),
    currencyDelta: currencySchema.optional(),
  })
  .refine((op) => Boolean(op.itemId) !== Boolean(op.custom), {
    message: "Provide exactly one of itemId or custom",
  });

const adjustQuantityOpSchema = z.object({
  type: z.literal("adjustQuantity"),
  inventoryItemId: z.string().min(1),
  delta: z.number().int().refine((n) => n !== 0, { message: "delta must not be zero" }),
});

const updateOpSchema = z.object({
  type: z.literal("update"),
  inventoryItemId: z.string().min(1),
  name: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  equipped: z.boolean().optional(),
  weight: z.number().nonnegative().optional(),
  cost: currencySchema.optional(),
  description: z.string().optional(),
  weapon: weaponDetailSchema.partial().optional(),
  armor: armorDetailSchema.partial().optional(),
  consumable: consumableDetailSchema.optional(),
});

const removeOpSchema = z.object({
  type: z.literal("remove"),
  inventoryItemId: z.string().min(1),
});

const sellOpSchema = z.object({
  type: z.literal("sell"),
  inventoryItemId: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  currencyDelta: currencySchema,
});

const setEquippedOpSchema = z.object({
  type: z.literal("setEquipped"),
  inventoryItemId: z.string().min(1),
  equipped: z.boolean(),
});

const operationSchema = z.discriminatedUnion("type", [
  acquireOpSchema,
  adjustQuantityOpSchema,
  updateOpSchema,
  removeOpSchema,
  sellOpSchema,
  setEquippedOpSchema,
]);

const transactionsRequestSchema = z.object({
  operations: z.array(operationSchema).min(1),
});

inventoryRouter.post("/characters/:id/inventory/transactions", async (req, res) => {
  await assertCharacterAccess(prisma, req.user!.id, req.params.id, "edit");

  const parseResult = transactionsRequestSchema.safeParse(req.body);
  if (!parseResult.success) {
    res
      .status(400)
      .json({ error: "Invalid request body", details: parseResult.error.flatten() });
    return;
  }

  try {
    await applyInventoryOperations(req.params.id, parseResult.data.operations);
  } catch (error) {
    if (error instanceof InsufficientCurrencyError || error instanceof InvalidInventoryOperationError) {
      res.status(400).json({ error: error.message });
      return;
    }
    throw error;
  }

  const updated = await prisma.character.findUnique({
    where: { id: req.params.id },
    include: characterInclude,
  });
  res.json(serializeCharacter(updated!));
});
