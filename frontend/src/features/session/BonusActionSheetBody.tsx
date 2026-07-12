/**
 * BonusActionSheetBody — the option-card list inside the Bonus Action sheet.
 *
 * Off-hand attack (when the loadout allows TWF), class bonus actions
 * (Second Wind, Rage, Cunning Action, …), each castable bonus-action spell as
 * its own card jumping straight into the cast flow, and the neutral
 * "Other bonus action" catch-all. A footer hint explains how to unlock the
 * off-hand attack when TWF is unavailable.
 */

import {
  GiCrossedSwords,
  GiSpellBook,
  MoreHorizontal,
} from "@/components/ui/icons";
import OptionCard from "@/features/session/OptionCard";
import { ClassActionCard } from "@/features/session/ActionSheetBody";
import type { BonusSheetModel } from "@/lib/turnOptions";

export default function BonusActionSheetBody({
  model,
  twfAvailable,
  busy,
  handleTwfAction,
  handleActionClick,
  handleBonusSpellCast,
  onOther,
}: {
  model: BonusSheetModel;
  twfAvailable: boolean;
  busy: boolean;
  handleTwfAction: () => void;
  handleActionClick: (key: string, cost: "bonusAction") => void;
  handleBonusSpellCast: (spellId: string) => void;
  /** "Other bonus action" — consume the slot and close the sheet. */
  onOther: () => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      {twfAvailable && (
        <OptionCard
          icon={GiCrossedSwords}
          title="Off-hand Attack (TWF)"
          subtitle={model.offHandSummary ?? undefined}
          tone="garnet"
          onClick={handleTwfAction}
        />
      )}

      {model.classBonusOptions.map((option) => (
        <ClassActionCard
          key={option.key}
          option={option}
          busy={busy}
          onClick={() => handleActionClick(option.key, "bonusAction")}
        />
      ))}

      {model.bonusSpells.map((spell) => (
        <OptionCard
          key={spell.spellId}
          icon={GiSpellBook}
          title={spell.name}
          subtitle={spell.subtitle}
          badge={spell.badge}
          badgeTone="gold"
          tone="arcane"
          onClick={() => handleBonusSpellCast(spell.spellId)}
        />
      ))}

      <OptionCard
        icon={MoreHorizontal}
        title="Other bonus action"
        subtitle="Just mark it used"
        badge="free"
        badgeTone="neutral"
        onClick={onOther}
      />

      {model.twfHintText && (
        <p className="px-1 pt-1 text-center text-[11px] text-parchment-500">{model.twfHintText}</p>
      )}
    </div>
  );
}
