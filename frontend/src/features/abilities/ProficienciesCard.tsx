// Weapon and armor proficiencies are derived server-side at read time
// (class + race + feats); this card only displays them, never edits them.

import { applyResourceTransactions } from "@/api/client";
import { useCurrentCharacter } from "@/hooks/CurrentCharacterProvider";
import { useCharacterMutation } from "@/hooks/useCharacterMutation";
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
  artisanTools: ToolOption[];
}

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

function sortedArmor(profs: ArmorProficiency[]): ArmorProficiency[] {
  return [...profs].sort(
    (a, b) =>
      ARMOR_CATEGORY_ORDER.indexOf(a.category) -
      ARMOR_CATEGORY_ORDER.indexOf(b.category)
  );
}

interface ProficiencyRowProps {
  label: string;
  // Accepts the full ProficiencySource union so narrower call-site types satisfy it.
  source: ProficiencySource;
  bonus?: string;
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
      
      <span
        className="block h-2 w-2 shrink-0 rounded-full bg-garnet-500"
        aria-hidden="true"
      />

      {/* No truncate class — long labels must stay fully readable (#1168); title is a hover backstop. */}
      <span
        className="min-w-0 flex-1 text-sm font-medium text-parchment-900"
        title={label}
      >
        {label}
      </span>

      {/* Abbreviated pill so a long source name can't crowd the label; full name stays reachable via title (#1168). */}
      <span
        className="shrink-0 rounded-full bg-parchment-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-parchment-600"
        title={SOURCE_LABELS[source]}
      >
        {sourcePillLabel(source)}
      </span>

      
      {bonus !== undefined && (
        <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-parchment-900">
          {bonus}
        </span>
      )}

      
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
      {/* @container-based sizing — viewport breakpoints would revert to wide-viewport column counts and clip labels (#1168). */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-1.5 @sm:grid-cols-2">
        {children}
      </div>
    </div>
  );
}

// learnMutation and forgetMutation share one character-${id} scope so they
// (and every other character mutation) can't race each other.
function useToolProficiencyMutations(character: Character) {
  const learnMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (name: string) => applyResourceTransactions(character.id, [{ type: "learnToolProficiency", name }]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to save tool proficiency. Please try again.",
  });
  const forgetMutation = useCharacterMutation({
    characterId: character.id,
    mutationFn: (entryId: string) => applyResourceTransactions(character.id, [{ type: "forgetToolProficiency", entryId }]),
    toCharacter: (c) => c,
    fallbackMessage: "Failed to remove tool proficiency. Please try again.",
  });

  async function learn(name: string) {
    try {
      await learnMutation.mutateAsync(name);
    } catch {
      // learnMutation.error already carries the message.
    }
  }

  async function forget(entryId: string) {
    try {
      await forgetMutation.mutateAsync(entryId);
    } catch {
      // forgetMutation.error already carries the message.
    }
  }

  return {
    busy: learnMutation.isPending || forgetMutation.isPending,
    error: learnMutation.error ?? forgetMutation.error,
    learn,
    forget,
  };
}

export default function ProficienciesCard({
  artisanTools,
}: Props) {
  const { character } = useCurrentCharacter();
  const { busy, error, learn: handleLearnToolProf, forget: handleForgetToolProf } =
    useToolProficiencyMutations(character);

  const weapons: WeaponProficiency[] = character.weaponProficiencies ?? [];
  const armor = sortedArmor(character.armorProficiencies ?? []);
  const tools = character.toolProficiencies ?? [];
  const resources = character.resources;

  const toolProfChoiceCount = resources?.toolProfChoiceCount ?? 0;
  const toolProfKnownCount = resources?.toolProficienciesKnown.length ?? 0;
  const canChooseArtisanTool =
    toolProfChoiceCount > 0 && toolProfKnownCount < toolProfChoiceCount;

  const alreadyChosenSubclassNames = new Set(
    (resources?.toolProficienciesKnown ?? []).map((t) => t.name)
  );

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

      
      {weapons.length > 0 && (
        <ProficiencySection title="Weapons">
          {weapons.map((p) => (
            <ProficiencyRow key={p.name} label={p.name} source={p.source} />
          ))}
        </ProficiencySection>
      )}

      
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
