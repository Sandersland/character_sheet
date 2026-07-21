// The spellcasting block on the record: an arcane-keyed ruled-ledger card with
// boxed stat readouts, slot pips, a read-only prepared roster, the single Cast
// door (#1162), the inline cast-result/error banners, and a Manage-spellbook
// opener (caster-spellbook.html §1).
import { abilityLabel } from "@/lib/abilities";
import { derivePreparedSummary } from "@/lib/preparedSummary";
import type { CastResult } from "@/lib/spellCast";
import type { SpellListDerivation } from "@/lib/spellList";
import type { Character, Spell } from "@/types/character";
import Card from "@/components/ui/Card";
import CastResultBanner from "@/features/spells/CastResultBanner";
import CastSpellDoor from "@/features/spells/CastSpellDoor";
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
  /** A live session is active — the Cast door defers to the Combat tab (#1162). */
  isLive: boolean;
  onExpend: (level: number) => void;
  onRestore: (level: number) => void;
  onCast: (spell: Spell, slotLevel?: number) => void;
  onGoToCombat: () => void;
  onManageSpellbook: () => void;
  onDropConcentration: () => void;
  onDismissBuff: (entryId: string) => void;
  onDismissResult: () => void;
}

// The card's title row: "Spellcasting" + the governing ability, when known.
function OverviewHeader({ ability }: { ability: string | undefined }) {
  return (
    <div className="flex items-center gap-2.5 text-[11px] font-bold uppercase tracking-wider text-arcane-800">
      <span>Spellcasting</span>
      {ability && (
        <span className="font-semibold normal-case tracking-normal text-parchment-500">
          {abilityLabel(ability)}
        </span>
      )}
      <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-arcane-200 to-transparent" />
    </div>
  );
}

// The post-cast result/error banners + the Manage-spellbook opener, split out
// so the top-level component's own branching stays under fallow's cognitive gate.
function OverviewFooter({
  castResult,
  error,
  onDismissResult,
  onManageSpellbook,
}: {
  castResult: CastResult | null;
  error: string | null;
  onDismissResult: () => void;
  onManageSpellbook: () => void;
}) {
  return (
    <>
      {castResult && <CastResultBanner result={castResult} onDismiss={onDismissResult} />}
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={onManageSpellbook}
        aria-label="Manage spellbook"
        className="rounded-lg border border-dashed border-arcane-500 py-2.5 text-center text-sm font-semibold text-arcane-800 hover:bg-arcane-50"
      >
        Manage spellbook <span aria-hidden="true">→</span>
      </button>
    </>
  );
}

export default function SpellcastingOverview({
  character, derived, busy, error, castResult, isLive,
  onExpend, onRestore, onCast, onGoToCombat, onManageSpellbook,
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
        <OverviewHeader ability={sc.ability} />
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
        <CastSpellDoor
          character={character}
          derived={derived}
          busy={busy}
          isLive={isLive}
          onCast={onCast}
          onGoToCombat={onGoToCombat}
        />
        <PreparedSpellList spellcasting={sc} />
        <OverviewFooter
          castResult={castResult}
          error={error}
          onDismissResult={onDismissResult}
          onManageSpellbook={onManageSpellbook}
        />
      </div>
    </Card>
  );
}
