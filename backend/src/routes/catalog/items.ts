import { Router } from "express";

import { Prisma } from "@/generated/prisma/client.js";
import {
  serializeArmorDetail,
  serializeConsumableDetail,
  serializeWeaponDetail,
} from "@/lib/inventory/itemDetail.js";
import { prisma } from "@/lib/core/prisma.js";

export const itemsRouter = Router();

const itemInclude = {
  weaponDetail: true,
  armorDetail: true,
  consumableDetail: true,
} satisfies Prisma.ItemInclude;

type ItemWithDetails = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;

// Same nested weapon/armor/consumable shape serializeInventoryItem in
// routes/characters.ts builds for an InventoryItem — see lib/inventory/itemDetail.ts.
function serializeItem(row: ItemWithDetails) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    weight: row.weight ?? undefined,
    cost: row.cost ?? undefined,
    description: row.description ?? undefined,
    weapon: row.weaponDetail ? serializeWeaponDetail(row.weaponDetail) : undefined,
    armor: row.armorDetail ? serializeArmorDetail(row.armorDetail) : undefined,
    consumable: row.consumableDetail ? serializeConsumableDetail(row.consumableDetail) : undefined,
  };
}

// Feeds the inventory editor's "add from catalog" picker (Phase B) — kept
// as its own endpoint rather than folded into GET /api/reference since the
// consumer is the character sheet, not the creation form (see reference.ts).
itemsRouter.get("/items", async (_req, res) => {
  const items = await prisma.item.findMany({ orderBy: { name: "asc" }, include: itemInclude });
  res.json(items.map(serializeItem));
});
