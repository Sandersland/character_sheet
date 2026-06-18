import type { InventoryItem } from "../types/character";
import Badge from "./Badge";

interface InventoryListProps {
  items: InventoryItem[];
  currency: { cp: number; sp: number; gp: number; pp: number };
}

/**
 * Multi-row cell pattern (components.md: "Multi-row cells avoid extra
 * columns for secondary metadata") — item name is the lead line, weight/
 * quantity fold into one natural-language subtext line per item instead
 * of a quantity column + weight column (principles.md: avoid naked
 * label:value pairs).
 */
export default function InventoryList({ items, currency }: InventoryListProps) {
  const totalWeight = items.reduce(
    (sum, item) => sum + (item.weight ?? 0) * item.quantity,
    0
  );

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex flex-col divide-y divide-[var(--color-parchment-200)]">
        {items.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-3 py-2.5">
            <div>
              <p className="text-sm font-medium text-[var(--color-parchment-900)]">
                {item.name}
                {item.equipped && (
                  <Badge tone="vitality" className="ml-2">
                    Equipped
                  </Badge>
                )}
              </p>
              <p className="mt-0.5 text-xs text-[var(--color-parchment-500)]">
                {item.quantity > 1 ? `${item.quantity}x` : "1x"}
                {item.weight ? ` · ${item.weight * item.quantity} lb` : ""}
              </p>
              {item.description && (
                <p className="mt-1 text-xs text-[var(--color-parchment-600)]">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        ))}
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
