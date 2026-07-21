/**
 * ActionSheetBody — the option-card list inside the Action picker sheet.
 *
 * Primary rich cards (Attack / Cast a spell / Use an item), class actions,
 * a compact Dash+Dodge pair, and the "More actions" disclosure that expands
 * in place to a tile grid of the remaining universal actions. Presentational:
 * all data arrives via the ActionSheetModel built in useTurnActions.
 */

import { useState } from "react";

import {
  ChevronDown,
  GiCrossedSwords,
  GiCycle,
  GiDodging,
  GiGrab,
  GiHealthNormal,
  GiHealthPotion,
  GiHoodedFigure,
  GiMagnifyingGlass,
  GiPush,
  GiRun,
  GiSandsOfTime,
  GiSpellBook,
  GiSprint,
  GiThreeFriends,
  Zap,
} from "@/components/ui/icons";
import OptionCard, { type OptionIcon } from "@/features/session/OptionCard";
import { MICRO_CAPTIONS, PRIMARY_ACTION_KEYS, moreActionsPreview } from "@/lib/turnOptions";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import { NO_BUDGET_REASON, changeWeaponsSubtitle } from "@/lib/loadoutPicker";
import type { ActionSheetModel, ClassActionOption } from "@/lib/turnOptions";

const NO_ACTION_LEFT_REASON = "No action left this turn";

/** disabled+reason for a card gated on `available` — spread onto OptionCard so
 *  the free-only-mode branching (#1165) lives here once, not per card. */
function actionGate(available: boolean, reason = NO_ACTION_LEFT_REASON) {
  return { disabled: !available, disabledReason: available ? undefined : reason };
}

/** The free-only-mode gate for a class-action card — disables it once the
 *  Action is spent, preserving any pool-driven disabledReason it already had. */
function gateClassAction(option: ClassActionOption, actionAvailable: boolean): ClassActionOption {
  if (actionAvailable) return option;
  return { ...option, enabled: false, disabledReason: option.disabledReason ?? NO_ACTION_LEFT_REASON };
}

const TILE_ICONS: Record<string, OptionIcon> = {
  disengage: GiSprint,
  help: GiThreeFriends,
  hide: GiHoodedFigure,
  search: GiMagnifyingGlass,
  ready: GiSandsOfTime,
  grapple: GiGrab,
  shove: GiPush,
};

/** Shared row card for a class action (also used by the Bonus/Reaction sheets). */
export function ClassActionCard({
  option,
  busy,
  onClick,
}: {
  option: ClassActionOption;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <OptionCard
      icon={option.heal ? GiHealthNormal : Zap}
      title={option.title}
      subtitle={option.subtitle}
      badge={option.badge}
      tone={option.heal ? "vitality" : option.enabled ? "arcane" : "neutral"}
      disabled={!option.enabled || busy}
      disabledReason={option.disabledReason}
      onClick={onClick}
    />
  );
}

export default function ActionSheetBody({
  model,
  busy,
  actionAvailable,
  handleAttackAction,
  handleActionClick,
}: {
  model: ActionSheetModel;
  busy: boolean;
  /** False once the Action is spent (#1165) — the sheet still opens, but only
   *  Change weapons (gated by its own interaction budget) stays enabled;
   *  everything else that spends the Action shows disabled with the reason. */
  actionAvailable: boolean;
  handleAttackAction: () => void;
  handleActionClick: (key: string, cost: "action") => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  // Same exclusion rule as the old pill list: universal actions the class
  // doesn't already provide; the primary five render as dedicated cards.
  const classKeys = new Set(model.classActionOptions.map((o) => o.key));
  const moreActions = UNIVERSAL_ACTIONS.filter(
    (u) => u.cost === "action" && !PRIMARY_ACTION_KEYS.has(u.key) && !classKeys.has(u.key),
  );

  const weaponsGate = actionGate(model.interactionBudgetRemaining > 0 || actionAvailable, NO_BUDGET_REASON);

  return (
    <div className="flex flex-col gap-2">
      <OptionCard
        icon={GiCrossedSwords}
        title="Attack"
        subtitle={model.attackSummary}
        tone="garnet"
        {...actionGate(actionAvailable)}
        onClick={handleAttackAction}
      />

      {model.hasSpellcasting && (
        <OptionCard
          icon={GiSpellBook}
          title="Cast a spell"
          subtitle="Only what you can afford"
          tone="arcane"
          {...actionGate(actionAvailable)}
          onClick={() => handleActionClick("castSpell", "action")}
        />
      )}

      <OptionCard
        icon={GiHealthPotion}
        title="Use an item"
        subtitle="Potions & consumables from your pack"
        badge={model.consumableCount > 0 ? `×${model.consumableCount}` : undefined}
        tone="gold"
        {...actionGate(actionAvailable)}
        onClick={() => handleActionClick("useObject", "action")}
      />

      <OptionCard
        icon={GiCycle}
        title="Change weapons"
        subtitle={changeWeaponsSubtitle(model.loadoutLabel, model.interactionBudgetRemaining, actionAvailable)}
        tone="neutral"
        {...weaponsGate}
        onClick={() => handleActionClick("changeWeapons", "action")}
      />

      {model.classActionOptions.map((option) => (
        <ClassActionCard
          key={option.key}
          option={gateClassAction(option, actionAvailable)}
          busy={busy}
          onClick={() => handleActionClick(option.key, "action")}
        />
      ))}

      <div className="grid grid-cols-2 gap-2">
        <OptionCard
          icon={GiRun}
          title="Dash"
          subtitle={MICRO_CAPTIONS.dash}
          variant="half"
          {...actionGate(actionAvailable)}
          onClick={() => handleActionClick("dash", "action")}
        />
        <OptionCard
          icon={GiDodging}
          title="Dodge"
          subtitle={MICRO_CAPTIONS.dodge}
          variant="half"
          {...actionGate(actionAvailable)}
          onClick={() => handleActionClick("dodge", "action")}
        />
      </div>

      {moreActions.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={moreOpen}
            onClick={() => setMoreOpen((open) => !open)}
            className="flex w-full items-center gap-2 rounded-card border border-dashed border-parchment-300 bg-parchment-50 p-3 text-left transition-colors hover:bg-parchment-100"
          >
            <span className="shrink-0 text-sm font-semibold text-parchment-800">More actions</span>
            {!moreOpen && (
              <span className="min-w-0 flex-1 truncate text-xs text-parchment-500">
                {moreActionsPreview(moreActions)}
              </span>
            )}
            <ChevronDown
              aria-hidden
              className={`ml-auto h-4 w-4 shrink-0 text-parchment-500 transition-transform ${moreOpen ? "rotate-180" : ""}`}
            />
          </button>
          {moreOpen && (
            <div className="grid grid-cols-3 gap-1.5">
              {moreActions.map((action) => (
                <OptionCard
                  key={action.key}
                  icon={TILE_ICONS[action.key] ?? Zap}
                  title={action.label}
                  subtitle={MICRO_CAPTIONS[action.key]}
                  variant="tile"
                  {...actionGate(actionAvailable)}
                  onClick={() => handleActionClick(action.key, "action")}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
