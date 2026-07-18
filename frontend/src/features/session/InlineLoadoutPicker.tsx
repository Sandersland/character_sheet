/**
 * InlineLoadoutPicker — the per-hand weapon-swap picker (#789) hosted inside the
 * Action sheet's "Change weapons" resolution (#815). A Main-hand and Off-hand
 * card, each expanding an inline disclosure of deduped bag candidates + a free
 * Stow. Per-option gating (loadoutPicker): swapping a HELD hand costs the
 * Action (blocked at 0), drawing into a FREE hand is free. A committed swap keeps
 * the sheet open and surfaces a Refund (also mirrored under the turn slots).
 */

import { useState } from "react";

import { equipSlotLabel, equippedLoadoutLabel, isOffHandLocked, itemsInSlot } from "@/lib/paperDoll";
import {
  handButtonDisabledReason,
  handContext,
  handPickerOptions,
  type HandContext,
  type PickerOption,
} from "@/lib/loadoutPicker";
import type { LoadoutSwapControls } from "@/features/session/useLoadoutSwap";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, EquipSlot, InventoryItem } from "@/types/character";

const HANDS: EquipSlot[] = ["MAIN_HAND", "OFF_HAND"];

function optionVerb(opt: PickerOption): string {
  if (opt.item === null) return "Stow";
  return opt.costsAction ? "Swap in" : "Equip";
}

interface HandCardProps {
  slot: EquipSlot;
  current: InventoryItem | undefined;
  ctx: HandContext;
  inventory: InventoryItem[];
  busy: boolean;
  expanded: boolean;
  onToggle: () => void;
  onChoose: (opt: PickerOption) => void;
}

function HandCard({ slot, current, ctx, inventory, busy, expanded, onToggle, onChoose }: HandCardProps) {
  const buttonDisabled = handButtonDisabledReason(slot, ctx);
  const options = handPickerOptions(inventory, slot, ctx);

  return (
    <div data-testid="hand-card" className="py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-semibold uppercase tracking-wide text-parchment-600">
          {equipSlotLabel(slot)}
          <span className="text-parchment-500"> · {current ? current.name : "Empty"}</span>
        </p>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          disabled={Boolean(buttonDisabled)}
          className="shrink-0 rounded-control px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-50 disabled:cursor-not-allowed disabled:text-parchment-400 disabled:hover:bg-transparent"
        >
          {current ? "Change" : "Equip"}
        </button>
      </div>

      {buttonDisabled && <p className="pt-0.5 text-xs text-parchment-500">{buttonDisabled}</p>}

      {expanded && !buttonDisabled && (
        options.length === 0 ? (
          <p className="pt-1 text-xs text-parchment-500">Nothing in your bag fits here.</p>
        ) : (
          <ul className="flex flex-col gap-1 pt-1">
            {options.map((opt) => (
              <li key={opt.item?.id ?? "stow"} className="flex flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-sm text-parchment-800">
                    {opt.label}
                    {opt.count > 1 && (
                      <span className="ml-1 rounded-full bg-parchment-200 px-1.5 py-0.5 text-[10px] font-semibold text-parchment-700">
                        ×{opt.count}
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() => onChoose(opt)}
                    disabled={busy || Boolean(opt.disabledReason)}
                    className="shrink-0 rounded-control border border-garnet-300 bg-garnet-700 px-3 py-1 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:cursor-not-allowed disabled:border-parchment-300 disabled:bg-parchment-200 disabled:text-parchment-500"
                  >
                    {optionVerb(opt)}
                  </button>
                </div>
                {opt.disabledReason && <p className="text-xs text-parchment-500">{opt.disabledReason}</p>}
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}

interface InlineLoadoutPickerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  loadout: LoadoutSwapControls;
}

export default function InlineLoadoutPicker({ character, turnState, loadout }: InlineLoadoutPickerProps) {
  const [expandedHand, setExpandedHand] = useState<EquipSlot | null>(null);
  const { busy, error, lastSwap, swap, stow, refund } = loadout;

  const offHandLocked = isOffHandLocked(character.inventory);
  const ctx = handContext(character.inventory, turnState.actionsRemaining);

  async function choose(slot: EquipSlot, opt: PickerOption) {
    if (opt.disabledReason) return;
    if (opt.item) await swap(opt.item, slot);
    else await stow(slot);
    setExpandedHand(null);
  }

  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs text-parchment-600">
        Now wielding <span className="font-semibold text-parchment-800">{equippedLoadoutLabel(character.inventory)}</span>.
      </p>

      {lastSwap && (
        <div className="flex items-center justify-between gap-2 rounded-control border border-arcane-200 bg-arcane-50 px-3 py-2">
          <span className="min-w-0 truncate text-xs font-semibold text-arcane-800">Weapons changed.</span>
          <button
            type="button"
            onClick={refund}
            disabled={busy}
            className="shrink-0 rounded-control border border-arcane-300 bg-arcane-100 px-2.5 py-1 text-xs font-semibold text-arcane-700 transition-colors hover:bg-arcane-200 disabled:opacity-50"
          >
            <span aria-hidden="true">↩ </span>Refund
            <span className="sr-only"> to {lastSwap.previousLabel}</span>
          </button>
        </div>
      )}

      {error && <p className="text-xs text-garnet-700">{error}</p>}

      <div className="flex flex-col divide-y divide-parchment-200">
        {HANDS.map((slot) => {
          if (slot === "OFF_HAND" && offHandLocked) return null;
          return (
            <HandCard
              key={slot}
              slot={slot}
              current={itemsInSlot(character.inventory, slot)[0]}
              ctx={ctx}
              inventory={character.inventory}
              busy={busy}
              expanded={expandedHand === slot}
              onToggle={() => setExpandedHand((h) => (h === slot ? null : slot))}
              onChoose={(opt) => choose(slot, opt)}
            />
          );
        })}
      </div>
    </div>
  );
}
