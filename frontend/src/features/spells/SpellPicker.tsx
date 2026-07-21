// The shared spell picker (#1160): quiet rows grouped by pick-list (cantrips /
// spells), one search box across every group, and the big SpellDetailCard on a
// row tap. The API is caller-owned — options are pre-filtered to eligibility, and
// each group carries its own cap + onToggle — so level-up (#1158) can adopt it
// without any creation-specific coupling here.
import { useState } from "react";

import SpellDetailCard from "@/features/spells/SpellDetailCard";
import SpellPickerRow from "@/features/spells/SpellPickerRow";
import { INPUT_CLS, filterCatalog } from "@/lib/addSpell";
import { budgetHeadline, pickDetailCtaLabel, pickRowState } from "@/lib/spellPickerView";
import type { CatalogSpell } from "@/types/character";

export interface SpellPickerGroup {
  key: string;
  label: string;
  options: CatalogSpell[];
  selectedIds: string[];
  cap: number;
  onToggle: (spellId: string) => void;
  note?: string;
}

export interface SpellPickerProps {
  groups: SpellPickerGroup[];
  knownSpellIds?: ReadonlySet<string>;
  /** Override the default budget headline (e.g. a level-up ceremony line). */
  headline?: string;
  /** Verb for the detail-card CTA; the row pill always reads "Add". */
  ctaVerb?: string;
}

const NO_KNOWN: ReadonlySet<string> = new Set();

export default function SpellPicker({ groups, knownSpellIds = NO_KNOWN, headline, ctaVerb = "Learn" }: SpellPickerProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<{ spellId: string; groupKey: string } | null>(null);

  const headlineText =
    headline ?? budgetHeadline(groups.map((g) => ({ label: g.label, selected: g.selectedIds.length, cap: g.cap })));
  const rendered = groups.map((g) => ({ group: g, filtered: filterCatalog(g.options, search, "") }));
  const anyResults = rendered.some((r) => r.filtered.length > 0);

  const openGroup = open ? groups.find((g) => g.key === open.groupKey) : undefined;
  const openSpell = openGroup?.options.find((s) => s.id === open?.spellId);

  function ctaFor(group: SpellPickerGroup, spell: CatalogSpell): { label: string; disabled: boolean; onPress: () => void } {
    const atCap = group.selectedIds.length >= group.cap;
    const { state, disabled } = pickRowState(spell, knownSpellIds, group.selectedIds, atCap);
    const onPress = () => {
      if (state !== "known") group.onToggle(spell.id);
      setOpen(null);
    };
    const label = pickDetailCtaLabel(spell.name, state, disabled, group.cap, group.selectedIds.length, ctaVerb);
    return { label, disabled, onPress };
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {headlineText && (
        <p className="shrink-0 text-center text-sm font-semibold text-parchment-700">{headlineText}</p>
      )}
      <input
        type="search"
        aria-label="Search spells"
        placeholder="Search spells by name or school…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className={`${INPUT_CLS} shrink-0`}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-1">
        {!anyResults && <p className="py-6 text-center text-sm text-parchment-500">No spells match your search.</p>}
        {rendered.map(
          ({ group, filtered }) =>
            filtered.length > 0 && (
              <section key={group.key}>
                <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-parchment-500">{group.label}</p>
                {group.note && <p className="mb-2 text-xs text-parchment-600">{group.note}</p>}
                <ul className="flex flex-col gap-2">
                  {filtered.map((spell) => {
                    const { state, disabled } = pickRowState(
                      spell,
                      knownSpellIds,
                      group.selectedIds,
                      group.selectedIds.length >= group.cap,
                    );
                    return (
                      <SpellPickerRow
                        key={spell.id}
                        spell={spell}
                        state={state}
                        disabled={disabled}
                        onToggle={group.onToggle}
                        onOpen={() => setOpen({ spellId: spell.id, groupKey: group.key })}
                      />
                    );
                  })}
                </ul>
              </section>
            ),
        )}
      </div>
      {openGroup && openSpell && (
        <SpellDetailCard spell={openSpell} cta={ctaFor(openGroup, openSpell)} onClose={() => setOpen(null)} />
      )}
    </div>
  );
}
