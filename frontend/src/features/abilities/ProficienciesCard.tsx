/**
 * ProficienciesCard — unified display of weapon, armor, and tool proficiencies.
 *
 * All three sub-sections (Weapons / Armor / tool categories) use the same
 * `ProficiencyRow` chip (dot · name · source pill · optional [+PB] · optional
 * [✕]) so the card fills its horizontal space instead of stretching one
 * centered column. Weapon/armor rows omit the bonus and forget slots
 * entirely rather than reserving a spacer for cross-section alignment —
 * that width goes to the label instead (#1168).
 *
 * Tool interactivity (Student-of-War picker, forget buttons) is folded in here
 * so the call site can render a single component. Weapons and armor are derived
 * server-side at read time (class + race + feats) and are read-only.
 */

import { useState } from "react";

import { applyResourceTransactions } from "@/api/client";
import {
  ARMOR_CATEGORY_LABELS,
  ARMOR_CATEGORY_ORDER,
  SOURCE_LABELS,
  sourcePillLabel,
  type ProficiencySource,
} from "@/lib/abilities";
import type {
  ArmorProficiency,
  Character,
  ToolOption,
  ToolProficiency,
  WeaponProficiency,
} from "@/types/character";

interface Props {
  character: Character;
  artisanTools: ToolOption[];
  onUpdate: (updated: Character) => void;
}

// Tool grouping helpers — identical to the ones that were in ToolProficienciesCard.
const CATEGORY_LABELS: Record<ToolProficiency["category"], string> = {
  artisan:           "Artisan's Tools",
  gamingSet:         "Gaming Sets",
  musicalInstrument: "Musical Instruments",
  other:             "Other Tools",
};

const CATEGORY_ORDER: ToolProficiency["category"][] = [
  "artisan",
  "musicalInstrument",
  "gamingSet",
  "other",
];

function groupByCategory(
  tools: ToolProficiency[]
): { category: ToolProficiency["category"]; tools: ToolProficiency[] }[] {
  const grouped = new Map<ToolProficiency["category"], ToolProficiency[]>();
  for (const t of tools) {
    if (!grouped.has(t.category)) grouped.set(t.category, []);
    grouped.get(t.category)!.push(t);
  }
  return CATEGORY_ORDER
    .filter((cat) => grouped.has(cat))
    .map((cat) => ({ category: cat, tools: grouped.get(cat)! }));
}

/** Sort armor proficiencies in canonical display order (light → medium → heavy → shield). */
function sortedArmor(profs: ArmorProficiency[]): ArmorProficiency[] {
  return [...profs].sort(
    (a, b) =>
      ARMOR_CATEGORY_ORDER.indexOf(a.category) -
      ARMOR_CATEGORY_ORDER.indexOf(b.category)
  );
}

interface ProficiencyRowProps {
  label: string;
  /** Accepts the full ProficiencySource union; narrowed types (weapon/armor/tool)
   *  are all subsets so TypeScript is happy at each call site. */
  source: ProficiencySource;
  /** "+3" etc. — tool rows only. When omitted the slot is skipped entirely;
   *  weapon/armor rows reclaim that width for the label instead of reserving
   *  a spacer (#1168). */
  bonus?: string;
  /** Forget callback — subclass-granted tools only. */
  onForget?: () => void;
  disabled?: boolean;
}

function ProficiencyRow({
  label,
  source,
  bonus,
  onForget,
  disabled,
}: ProficiencyRowProps) {
  return (
    <div className="flex items-center gap-2.5 border-b border-parchment-200/70 py-1.5 last:border-b-0">
      {/* Proficiency dot */}
      <span
        className="block h-2 w-2 shrink-0 rounded-full bg-garnet-500"
        aria-hidden="true"
      />

      {/* Name — left-aligned, wraps instead of truncating so long labels
          (category names, subclass-granted tools) are always fully
          readable (#1168); title tooltip is a hover backstop */}
      <span
        className="min-w-0 flex-1 text-sm font-medium text-parchment-900"
        title={label}
      >
        {label}
      </span>

      {/* Source pill — abbreviates when the source label is long (e.g. a
          subclass name) so it can't crowd out the proficiency label; the
          full label is still reachable via title (#1168) */}
      <span
        className="shrink-0 rounded-full bg-parchment-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-parchment-600"
        title={SOURCE_LABELS[source]}
      >
        {sourcePillLabel(source)}
      </span>

      {/* Bonus — tools only; weapon/armor rows omit it rather than reserve a spacer */}
      {bonus !== undefined && (
        <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-parchment-900">
          {bonus}
        </span>
      )}

      {/* Forget — subclass-granted tools only; omitted (no spacer) everywhere else */}
      {onForget && (
        <button
          onClick={onForget}
          disabled={disabled}
          title="Remove this tool proficiency choice"
          aria-label={`Remove proficiency: ${label}`}
          className="shrink-0 rounded-control text-center text-[10px] text-parchment-600 hover:text-garnet-600 disabled:opacity-40"
        >
          ✕
        </button>
      )}
    </div>
  );
}

function ProficiencySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="@container">
      <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
        {title}
      </h4>
      {/* Chip grid sized off the card's own rendered width via container
          queries, not viewport breakpoints — a narrow Overview sub-column
          used to still get the wide-viewport column count and clip labels
          (#1168). Capped at 2 columns; 1 below @sm. */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 @sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

export default function ProficienciesCard({
  character,
  artisanTools,
  onUpdate,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const weapons: WeaponProficiency[] = character.weaponProficiencies ?? [];
  const armor = sortedArmor(character.armorProficiencies ?? []);
  const tools = character.toolProficiencies ?? [];
  const resources = character.resources;

  // Student-of-War picker is shown when the subclass grants a choice not yet filled.
  const toolProfChoiceCount = resources?.toolProfChoiceCount ?? 0;
  const toolProfKnownCount = resources?.toolProficienciesKnown.length ?? 0;
  const canChooseArtisanTool =
    toolProfChoiceCount > 0 && toolProfKnownCount < toolProfChoiceCount;

  // Names already chosen via subclass — don't offer them again.
  const alreadyChosenSubclassNames = new Set(
    (resources?.toolProficienciesKnown ?? []).map((t) => t.name)
  );

  async function handleLearnToolProf(name: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyResourceTransactions(character.id, [
        { type: "learnToolProficiency", name },
      ]);
      onUpdate(updated);
    } catch {
      setError("Failed to save tool proficiency. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleForgetToolProf(entryId: string) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyResourceTransactions(character.id, [
        { type: "forgetToolProficiency", entryId },
      ]);
      onUpdate(updated);
    } catch {
      setError("Failed to remove tool proficiency. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const hasAnything =
    weapons.length > 0 ||
    armor.length > 0 ||
    tools.length > 0 ||
    canChooseArtisanTool;

  if (!hasAnything) return null;

  const grouped = groupByCategory(tools);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {/* Weapons */}
      {weapons.length > 0 && (
        <ProficiencySection title="Weapons">
          {weapons.map((p) => (
            <ProficiencyRow key={p.name} label={p.name} source={p.source} />
          ))}
        </ProficiencySection>
      )}

      {/* Armor */}
      {armor.length > 0 && (
        <ProficiencySection title="Armor">
          {armor.map((p) => (
            <ProficiencyRow
              key={p.category}
              label={ARMOR_CATEGORY_LABELS[p.category]}
              source={p.source}
            />
          ))}
        </ProficiencySection>
      )}

      {/* Tools — grouped by category */}
      {grouped.map(({ category, tools: catTools }) => (
        <ProficiencySection key={category} title={CATEGORY_LABELS[category]}>
          {catTools.map((tool) => {
            const subclassEntry = resources?.toolProficienciesKnown.find(
              (e) => e.name === tool.name
            );
            const isSubclass = tool.source === "subclass";

            return (
              <ProficiencyRow
                key={tool.name}
                label={tool.name}
                source={tool.source}
                bonus={`+${character.proficiencyBonus}`}
                onForget={
                  isSubclass && subclassEntry
                    ? () => handleForgetToolProf(subclassEntry.id)
                    : undefined
                }
                disabled={busy}
              />
            );
          })}
        </ProficiencySection>
      ))}

      {/* Student of War artisan's-tool picker */}
      {canChooseArtisanTool && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Student of War
          </h4>
          <p className="mb-2 text-xs text-parchment-600">
            Choose one artisan's tool to gain proficiency with.
          </p>
          <select
            defaultValue=""
            disabled={busy}
            onChange={(e) => {
              if (e.target.value) handleLearnToolProf(e.target.value);
            }}
            className="w-full max-w-xs rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>
              Choose an artisan's tool…
            </option>
            {artisanTools
              .filter((t) => !alreadyChosenSubclassNames.has(t.name))
              .map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
          </select>
          {busy && (
            <span className="mt-1 block text-[10px] text-parchment-600">
              Saving…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
