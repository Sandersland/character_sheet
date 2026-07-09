import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import { Lock } from "@/components/ui/icons";
import { itemCategoryLabel } from "@/lib/items";
import { rarityLabel, rarityTone } from "@/lib/rarity";
import type { CampaignItem } from "@/types/character";

interface CampaignItemRowProps {
  item: CampaignItem;
  campaignId: string;
  characters: { id: string; name: string; ownerId: string }[];
  busyId: string | null;
  awardTargetValue: string;
  onToggleReveal: (item: CampaignItem) => void;
  onEdit: (item: CampaignItem) => void;
  onDelete: (item: CampaignItem) => void;
  onAward: (item: CampaignItem) => void;
  onRevoke: (item: CampaignItem, characterId: string) => void;
  onAwardTargetChange: (itemId: string, characterId: string) => void;
}

const actionCls = "text-xs font-semibold text-garnet-700 hover:underline disabled:opacity-40";

function HolderList({
  item,
  busyId,
  onRevoke,
}: Pick<CampaignItemRowProps, "item" | "busyId" | "onRevoke">) {
  return (
    <ul className="flex flex-col gap-1 pl-1 text-xs text-parchment-700">
      {(item.holders ?? []).map((h) => (
        <li key={h.characterId} className="flex items-center gap-2">
          <span>
            Held by <span className="font-semibold">{h.characterName}</span>
            {h.quantity > 1 ? ` ×${h.quantity}` : ""}
          </span>
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => onRevoke(item, h.characterId)}
            className="font-semibold text-garnet-700 hover:underline disabled:opacity-40"
          >
            Revoke
          </button>
        </li>
      ))}
    </ul>
  );
}

function AwardControl({
  item,
  characters,
  busyId,
  awardTargetValue,
  onAward,
  onAwardTargetChange,
}: Pick<
  CampaignItemRowProps,
  "item" | "characters" | "busyId" | "awardTargetValue" | "onAward" | "onAwardTargetChange"
>) {
  return (
    <div className="flex items-center gap-2 pl-1">
      <label htmlFor={`award-${item.id}`} className="text-xs text-parchment-600">
        Award to
      </label>
      <select
        id={`award-${item.id}`}
        className="rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1 text-xs text-parchment-900"
        value={awardTargetValue}
        onChange={(e) => onAwardTargetChange(item.id, e.target.value)}
      >
        <option value="">Choose character…</option>
        {characters.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={busyId === item.id || !awardTargetValue}
        onClick={() => onAward(item)}
        className="rounded-control bg-garnet-600 px-2 py-1 text-xs font-semibold text-parchment-50 hover:bg-garnet-700 disabled:opacity-40"
      >
        Award
      </button>
    </div>
  );
}

function RowBadges({
  item,
  campaignId,
  hidden,
}: Pick<CampaignItemRowProps, "item" | "campaignId"> & { hidden: boolean }) {
  return (
    <>
      {item.entity ? (
        <Link
          to={`/campaigns/${campaignId}/entities/${item.entity.id}`}
          className="text-sm font-semibold text-parchment-900 hover:underline"
        >
          {item.name}
        </Link>
      ) : (
        <span className="text-sm font-semibold text-parchment-900">{item.name}</span>
      )}
      <Badge tone="gold">{itemCategoryLabel(item.category)}</Badge>
      {item.rarity && <Badge tone={rarityTone(item.rarity)}>{rarityLabel(item.rarity)}</Badge>}
      {item.isUnique && <Badge tone="arcane">Unique</Badge>}
      {hidden && (
        <Badge tone="neutral">
          <Lock aria-hidden="true" className="h-3 w-3" />
          Hidden
        </Badge>
      )}
    </>
  );
}

function RowActions({
  item,
  busyId,
  hidden,
  onToggleReveal,
  onEdit,
  onDelete,
}: Pick<CampaignItemRowProps, "item" | "busyId" | "onToggleReveal" | "onEdit" | "onDelete"> & {
  hidden: boolean;
}) {
  return (
    <span className="ml-auto flex items-center gap-3">
      <button
        type="button"
        disabled={busyId === item.id || !item.entity}
        onClick={() => onToggleReveal(item)}
        className={actionCls}
      >
        {hidden ? "Reveal" : "Hide"}
      </button>
      <button type="button" disabled={busyId === item.id} onClick={() => onEdit(item)} className={actionCls}>
        Edit
      </button>
      <button type="button" disabled={busyId === item.id} onClick={() => onDelete(item)} className={actionCls}>
        Delete
      </button>
    </span>
  );
}

export default function CampaignItemRow(props: CampaignItemRowProps) {
  const { item, campaignId, characters, busyId } = props;
  const hidden = item.entity?.visibility === "HIDDEN";
  const holders = item.holders ?? [];
  const held = item.isUnique && holders.length > 0;

  return (
    <li className="flex flex-col gap-2 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <RowBadges item={item} campaignId={campaignId} hidden={hidden} />
        <RowActions
          item={item}
          busyId={busyId}
          hidden={hidden}
          onToggleReveal={props.onToggleReveal}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
        />
      </div>

      {holders.length > 0 && <HolderList item={item} busyId={busyId} onRevoke={props.onRevoke} />}

      {characters.length > 0 && !held && (
        <AwardControl
          item={item}
          characters={characters}
          busyId={busyId}
          awardTargetValue={props.awardTargetValue}
          onAward={props.onAward}
          onAwardTargetChange={props.onAwardTargetChange}
        />
      )}
    </li>
  );
}
