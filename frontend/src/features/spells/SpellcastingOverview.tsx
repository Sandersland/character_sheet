// Top-of-section overview: stat bar, concentration/buff banners, slot meters,
// and the inline cast-result + error banners. Returns a Fragment so its blocks
// stay direct children of SpellsSection's gap-5 flex column.
import { derivePreparedSummary } from "@/lib/preparedSummary";
import type { CastResult } from "@/lib/spellCast";
import type { SpellListDerivation } from "@/lib/spellList";
import type { Character, Spell } from "@/types/character";
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
    <>
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
    </>
  );
}
