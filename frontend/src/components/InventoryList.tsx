import type { Currency, InventoryItem, ItemCategory } from "../types/character";
import Badge from "./Badge";

interface InventoryListProps {
  items: InventoryItem[];
  currency: Currency;
}

const CATEGORY_TONE: Record<ItemCategory, "garnet" | "arcane" | "gold" | "neutral"> = {
  weapon: "garnet",
  armor: "arcane",
  consumable: "gold",
  gear: "neutral",
};

/**
 * Multi-row cell pattern (components.md: "Multi-row cells avoid extra
 * columns for secondary metadata") — item name is the lead line, weight/
 * quantity/combat stats fold into one natural-language subtext line per
 * item instead of separate columns (principles.md: avoid naked
 * label:value pairs). `description` is the catalog item's own flavor
 * text/rules text; `notes` (italicized) is the player's own annotation on
 * this specific row — kept visually distinct since they answer different
 * questions ("what is this" vs. "what did I do with it").
 */
export default function InventoryList({ items, currency }: InventoryListProps) {
  const totalWeight = items.reduce(
    (sum, item) => sum + (item.weight ?? 0) * item.quantity,
    0
  );

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-[var(--color-parchment-200)]">
        {items.map((item) => {
          const details = [
            item.quantity > 1 ? `${item.quantity}x` : "1x",
            item.weight ? `${item.weight * item.quantity} lb` : null,
            item.damageDice
              ? `${item.damageDice}${item.damageType ? ` ${item.damageType}` : ""}`
              : null,
            item.armorClass ? `AC ${item.armorClass}` : null,
            item.properties.length > 0 ? item.properties.join(", ") : null,
          ].filter((part): part is string => part !== null);

          return (
            <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
              <div>
                <p className="text-sm font-medium text-[var(--color-parchment-900)]">
                  {item.name}
                  <Badge tone={CATEGORY_TONE[item.category]} className="ml-2">
                    {item.category}
                  </Badge>
                  {item.equipped && (
                    <Badge tone="vitality" className="ml-1.5">
                      Equipped
                    </Badge>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-[var(--color-parchment-500)]">
                  {details.join(" · ")}
                </p>
                {item.description && (
                  <p className="mt-1 text-xs text-[var(--color-parchment-600)]">
                    {item.description}
                  </p>
                )}
                {item.notes && (
                  <p className="mt-1 text-xs italic text-[var(--color-parchment-500)]">
                    {item.notes}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-between border-t border-[var(--color-parchment-200)] pt-3 text-xs text-[var(--color-parchment-600)]">
        <span>{totalWeight.toFixed(1)} lb carried</span>
        <span className="tabular-nums">
          {currency.pp > 0 && `${currency.pp} pp `}
          {currency.gp} gp · {currency.sp} sp · {currency.cp} cp
        </span>
      </div>
    </div>
  );
}
