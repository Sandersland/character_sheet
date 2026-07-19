import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { Lock } from "@/components/ui/icons";
import { itemDetailRows } from "@/lib/itemCard";
import { itemCategoryLabel } from "@/lib/items";
import { rarityLabel, rarityTone } from "@/lib/rarity";
import type { CampaignItem } from "@/types/character";

interface CampaignItemCardProps {
  item: CampaignItem;
  /** dmNotes render only for the owner — never present in a player payload. */
  isOwner: boolean;
}

const labelCls = "block text-xs font-semibold text-parchment-700";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-1 text-sm">
      <span className="text-parchment-600">{label}</span>
      <span className="font-medium text-parchment-900">{value}</span>
    </div>
  );
}

// The Codex item card: badges (rarity/attunement/unique), category-specific
// mechanical detail (rows derived in itemDetailRows), description, and —
// owner only — the DM's private notes.
export default function CampaignItemCard({ item, isOwner }: CampaignItemCardProps) {
  return (
    <Card title="Item" headingLevel={2} className="p-4">
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="gold">{itemCategoryLabel(item.category)}</Badge>
          {item.rarity && <Badge tone={rarityTone(item.rarity)}>{rarityLabel(item.rarity)}</Badge>}
          {item.requiresAttunement && <Badge tone="garnet">Requires attunement</Badge>}
          {item.isUnique && <Badge tone="neutral">Unique</Badge>}
        </div>

        <div className="rounded-control border border-parchment-200 bg-parchment-50 px-3 py-1">
          {itemDetailRows(item).map((row) => (
            <DetailRow key={row.label} label={row.label} value={row.value} />
          ))}
        </div>

        {item.description && (
          <div>
            <p className={labelCls}>Description</p>
            <p className="whitespace-pre-wrap text-sm text-parchment-800">{item.description}</p>
          </div>
        )}

        {item.holders && item.holders.length > 0 && (
          <div>
            <p className={labelCls}>Held by</p>
            <ul className="mt-1 flex flex-col gap-1 text-sm text-parchment-800">
              {item.holders.map((h) => (
                <li key={h.characterId}>
                  {h.characterName}
                  {h.quantity > 1 ? ` ×${h.quantity}` : ""}
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOwner && item.dmNotes && (
          <div className="rounded-control border border-garnet-200 bg-garnet-50 p-3">
            <p className="flex items-center gap-1 text-xs font-semibold text-garnet-700">
              <Lock aria-hidden="true" className="h-3 w-3" />
              DM notes (hidden from players)
            </p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-garnet-900">{item.dmNotes}</p>
          </div>
        )}
      </div>
    </Card>
  );
}
