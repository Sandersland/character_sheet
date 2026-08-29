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
  GiOpenBook,
  GiPublicSpeaker,
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
import { NO_BUDGET_REASON, changeWeaponsSubtitle } from "@/lib/loadoutPicker";
import type { ActionSheetModel, ClassActionOption } from "@/lib/turnOptions";

const NO_ACTION_LEFT_REASON = "No action left this turn";

function actionGate(available: boolean, reason = NO_ACTION_LEFT_REASON) {
  return { disabled: !available, disabledReason: available ? undefined : reason };
}

function gateClassAction(option: ClassActionOption, actionAvailable: boolean): ClassActionOption {
  if (actionAvailable) return option;
  return { ...option, enabled: false, disabledReason: option.disabledReason ?? NO_ACTION_LEFT_REASON };
}

// Keyed on the edition-stable `key`, never the served `name` — 2024 renames
// (Magic / Utilize) must not cost a tile its glyph.
const TILE_ICONS: Record<string, OptionIcon> = {
  disengage: GiSprint,
  help: GiThreeFriends,
  hide: GiHoodedFigure,
  search: GiMagnifyingGlass,
  ready: GiSandsOfTime,
  grapple: GiGrab,
  shove: GiPush,
  study: GiOpenBook,
  influence: GiPublicSpeaker,
};

// Shared with BonusActionSheetBody and ReactionSlot — keep behavior in sync.
export function ClassActionCard({
  option,
  busy,
  onClick,
}: {
  option: ClassActionOption;
  busy: boolean;
  onClick: () => void;
}) {
  // regrantNames wins the subtitle unconditionally — safe only because no action
  // carries both regrantNames and a heal-roll/resolver subtitle; not enforced here.
  const subtitle = option.regrantNames?.join(" · ") ?? option.subtitle;
  return (
    <OptionCard
      icon={option.heal ? GiHealthNormal : Zap}
      title={option.title}
      subtitle={subtitle}
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
  actionAvailable: boolean;
  handleAttackAction: () => void;
  handleActionClick: (key: string, cost: "action") => void;
}) {
  const [moreOpen, setMoreOpen] = useState(false);

  const classKeys = new Set(model.classActionOptions.map((o) => o.key));
  const moreActions = model.universalActions.filter(
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
                  title={action.name}
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
