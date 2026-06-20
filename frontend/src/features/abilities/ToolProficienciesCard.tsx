/**
 * ToolProficienciesCard — shows all tool proficiencies on the character sheet,
 * grouped by category. For Battle Masters at level 3+, also renders the
 * Student of War artisan's-tool picker.
 *
 * TODO: Add an interactive tool-check roller (pick an ability, roll d20 +
 * ability modifier + proficiency bonus). For now display-only — the player
 * can read off the +PB bonus and pick their ability in the moment.
 */

import { useState } from "react";

import { applyResourceTransactions } from "@/api/client";
import type {
  Character,
  ToolOption,
  ToolProficiency,
} from "@/types/character";

interface Props {
  character: Character;
  artisanTools: ToolOption[];
  onUpdate: (updated: Character) => void;
}

const CATEGORY_LABELS: Record<ToolProficiency["category"], string> = {
  artisan:          "Artisan's Tools",
  gamingSet:        "Gaming Sets",
  musicalInstrument: "Musical Instruments",
  other:            "Other Tools",
};

const SOURCE_LABELS: Record<ToolProficiency["source"], string> = {
  background: "Background",
  class:      "Class",
  race:       "Race",
  subclass:   "Battle Master",
};

const CATEGORY_ORDER: ToolProficiency["category"][] = [
  "artisan",
  "musicalInstrument",
  "gamingSet",
  "other",
];

/** Groups tools by category and preserves the canonical display order. */
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

export default function ToolProficienciesCard({ character, artisanTools, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tools = character.toolProficiencies ?? [];
  const resources = character.resources;

  // Student of War picker is shown when the subclass grants a tool choice
  // that hasn't been filled yet.
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

  if (tools.length === 0 && !canChooseArtisanTool) return null;

  const grouped = groupByCategory(tools);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {/* ── Proficiency list grouped by category ── */}
      {grouped.map(({ category, tools: catTools }) => (
        <div key={category}>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            {CATEGORY_LABELS[category]}
          </h4>
          <table className="w-full table-fixed border-collapse text-sm">
            <caption className="sr-only">{CATEGORY_LABELS[category]} proficiencies</caption>
            <thead className="sr-only">
              <tr>
                <th scope="col">Proficient</th>
                <th scope="col">Tool</th>
                <th scope="col">Source</th>
                <th scope="col">Bonus</th>
              </tr>
            </thead>
            <tbody>
              {catTools.map((tool) => {
                // Level-gated entries have an id in toolProficienciesKnown
                const subclassEntry = resources?.toolProficienciesKnown.find(
                  (e) => e.name === tool.name
                );
                const isSubclass = tool.source === "subclass";

                return (
                  <tr key={tool.name} className="border-t border-parchment-200">
                    {/* Proficiency dot */}
                    <td className="w-6 py-1.5 pl-4">
                      <span
                        className="block h-2 w-2 rounded-full bg-garnet-500"
                        aria-hidden="true"
                      />
                    </td>
                    {/* Tool name */}
                    <td className="w-[46%] py-1.5 font-medium text-parchment-900">
                      {tool.name}
                    </td>
                    {/* Source tag */}
                    <td className="py-1.5 text-xs text-parchment-400">
                      {SOURCE_LABELS[tool.source]}
                    </td>
                    {/* PB bonus */}
                    <td className="py-1.5 pr-2 text-right tabular-nums font-semibold text-parchment-900">
                      +{character.proficiencyBonus}
                    </td>
                    {/* Forget button (subclass choices only) */}
                    <td className="w-8 py-1.5 pr-2 text-right">
                      {isSubclass && subclassEntry && (
                        <button
                          onClick={() => handleForgetToolProf(subclassEntry.id)}
                          disabled={busy}
                          title="Remove this tool proficiency choice"
                          aria-label={`Remove proficiency: ${tool.name}`}
                          className="rounded-control px-1 py-0.5 text-[10px] text-parchment-400 hover:text-garnet-600 disabled:opacity-40"
                        >
                          ✕
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}

      {/* ── Student of War artisan's-tool picker ── */}
      {canChooseArtisanTool && (
        <div>
          <h4 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
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
            className="w-full max-w-xs rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
          >
            <option value="" disabled>Choose an artisan's tool…</option>
            {artisanTools
              .filter((t) => !alreadyChosenSubclassNames.has(t.name))
              .map((t) => (
                <option key={t.name} value={t.name}>
                  {t.name}
                </option>
              ))}
          </select>
          {busy && (
            <span className="mt-1 block text-[10px] text-parchment-400">
              Saving…
            </span>
          )}
        </div>
      )}
    </div>
  );
}
