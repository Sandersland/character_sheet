// The spellcasting block on the record: an arcane-keyed ruled-ledger card with
// boxed stat readouts, slot pips, a prepared quick-cast list, the inline
// cast-result/error banners, and a Manage-spellbook opener (caster-spellbook.html §1).
import { abilityLabel } from "@/lib/abilities";
import { derivePreparedSummary } from "@/lib/preparedSummary";
import type { CastResult } from "@/lib/spellCast";
import type { SpellListDerivation } from "@/lib/spellList";
import type { Character, Spell } from "@/types/character";
import Card from "@/components/ui/Card";
import CastResultBanner from "@/features/spells/CastResultBanner";
import PreparedSpellList from "@/features/spells/PreparedSpellList";
import SpellStatusBanners from "@/features/spells/SpellStatusBanners";
import SpellSlotMeters from "@/features/spells/SpellSlotMeters";
import SpellcastingStatBar from "@/features/spells/SpellcastingStatBar";

interface SpellcastingOverviewProps {
  character: Character;
  derived: SpellListDerivation;
  busy: boolean;
  error: string | null;
  castResult: CastResult | null;
  onExpend: (level: number) => void;
  onRestore: (level: number) => void;
  onCast: (spell: Spell) => void;
  onManageSpellbook: () => void;
  onDropConcentration: () => void;
  onDismissBuff: (entryId: string) => void;
  onDismissResult: () => void;
}

export default function SpellcastingOverview({
  character, derived, busy, error, castResult,
  onExpend, onRestore, onCast, onManageSpellbook,
  onDropConcentration, onDismissBuff, onDismissResult,
}: SpellcastingOverviewProps) {
  const sc = character.spellcasting!;

  return (
    <Card className="p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-2 rounded border border-parchment-300"
      />
      <div className="relative flex flex-col gap-4">
      <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wider text-arcane-800">
        <span>Spellcasting</span>
        {sc.ability && (
          <span className="font-semibold normal-case tracking-normal text-parchment-500">
            {abilityLabel(sc.ability)}
          </span>
        )}
        <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-arcane-200 to-transparent" />
      </div>
      <SpellcastingStatBar
        spellSaveDC={sc.spellSaveDC}
        spellAttackBonus={sc.spellAttackBonus}
        prepared={derivePreparedSummary(sc)}
      />
      <SpellStatusBanners
        concentratingOn={sc.concentratingOn ?? null}
        dismissibleSpellBuffs={derived.dismissibleSpellBuffs}
        busy={busy}
        onDropConcentration={onDropConcentration}
        onDismissBuff={onDismissBuff}
      />
      <SpellSlotMeters
        slots={sc.slots ?? []}
        pact={sc.pact ?? null}
        arcana={sc.arcana ?? []}
        slotsArePactMagic={derived.slotsArePactMagic}
        busy={busy}
        onExpend={onExpend}
        onRestore={onRestore}
      />
      <PreparedSpellList spellcasting={sc} busy={busy} onCast={onCast} />
      {castResult && <CastResultBanner result={castResult} onDismiss={onDismissResult} />}
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onManageSpellbook}
        className="rounded-lg border border-dashed border-arcane-500 py-2.5 text-center text-sm font-semibold text-arcane-800 hover:bg-arcane-50"
      >
        Manage spellbook →
      </button>
      </div>
    </Card>
  );
}
