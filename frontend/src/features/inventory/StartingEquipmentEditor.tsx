import {
  emptyPackageState,
  goldLabel,
  goldMax,
  goldMin,
  isGoldValid,
  rollGold,
  type EquipmentDraft,
} from "@/lib/startingEquipment";
import type {
  ClassStartingEquipment,
  EquipmentBundle,
  Item,
  OpenWeaponPick,
} from "@/types/character";

interface StartingEquipmentEditorProps {
  /** The selected class's starting-equipment definition (null → skip rendering). */
  startingEquipment: ClassStartingEquipment | null;
  /** Full item catalog, used to populate open-pick weapon dropdowns. */
  catalog: Item[];
  /** Current draft value. */
  value: EquipmentDraft;
  onChange: (draft: EquipmentDraft) => void;
}

/** Describes the fixed-item contents of a bundle (no open pick placeholders). */
function bundleFixedSummary(bundle: EquipmentBundle): string {
  return (bundle.items ?? [])
    .map((item) => {
      const qty = item.quantity ?? 1;
      return qty > 1 ? `${item.catalogName} ×${qty}` : item.catalogName;
    })
    .join(", ");
}

interface OpenPickSelectProps {
  pick: OpenWeaponPick;
  catalog: Item[];
  currentPick: string;
  onPick: (itemName: string) => void;
}

/** A single open-pick dropdown, filtered to the pick's weapon-class/range constraint. */
function OpenPickSelect({ pick, catalog, currentPick, onPick }: OpenPickSelectProps) {
  const matchingItems = catalog.filter(
    (item) =>
      item.category === "weapon" &&
      item.weapon !== undefined &&
      (!pick.filter.weaponClass || item.weapon.weaponClass === pick.filter.weaponClass) &&
      (!pick.filter.range || item.weapon.weaponRange === pick.filter.range)
  );
  const unfilled = !currentPick;
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-parchment-600">
        {pick.label}
        {unfilled && (
          <span className="ml-1 font-semibold text-red-600">
            (required)
          </span>
        )}
      </span>
      <select
        value={currentPick}
        aria-invalid={unfilled}
        onChange={(e) => onPick(e.target.value)}
        className={`rounded-control border bg-parchment-50 px-2 py-1.5 text-sm text-parchment-900 focus:outline-none ${
          unfilled
            ? "border-red-400 focus:border-red-500"
            : "border-parchment-300 focus:border-arcane-500"
        }`}
      >
        <option value="">— choose —</option>
        {matchingItems.map((item) => (
          <option key={item.id} value={item.name}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}

interface OpenPickListProps {
  bundle: EquipmentBundle;
  catalog: Item[];
  currentPicks: string[] | undefined;
  onPick: (pickIdx: number, itemName: string) => void;
}

/** Renders a bundle's open-pick dropdowns (may be none). */
function OpenPickList({ bundle, catalog, currentPicks, onPick }: OpenPickListProps) {
  if (!bundle.openPicks?.length) return null;
  return (
    <>
      {bundle.openPicks.map((pick, pickIdx) => (
        <OpenPickSelect
          key={pickIdx}
          pick={pick}
          catalog={catalog}
          currentPick={currentPicks?.[pickIdx] ?? ""}
          onPick={(itemName) => onPick(pickIdx, itemName)}
        />
      ))}
    </>
  );
}

export default function StartingEquipmentEditor({
  startingEquipment,
  catalog,
  value,
  onChange,
}: StartingEquipmentEditorProps) {
  if (!startingEquipment) return null;

  const isPackage = value.mode === "package";
  const isGold = value.mode === "gold";

  function setMode(mode: "package" | "gold") {
    if (mode === "package") {
      onChange({ mode: "package", selections: emptyPackageState(startingEquipment!) });
    } else {
      onChange({ mode: "gold", gold: 0 });
    }
  }

  function setOptionIndex(groupIdx: number, optionIdx: number) {
    if (value.mode !== "package") return;
    const bundle = startingEquipment!.groups[groupIdx].options[optionIdx];
    const openPickCount = bundle.openPicks?.length ?? 0;
    const newSelections = [...value.selections];
    newSelections[groupIdx] = {
      optionIndex: optionIdx,
      openPicks: Array(openPickCount).fill(""),
    };
    onChange({ mode: "package", selections: newSelections });
  }

  function setOpenPick(groupIdx: number, pickIdx: number, itemName: string) {
    if (value.mode !== "package") return;
    const newSelections = [...value.selections];
    const sel = { ...newSelections[groupIdx] };
    const newPicks = [...(sel.openPicks ?? [])];
    newPicks[pickIdx] = itemName;
    sel.openPicks = newPicks;
    newSelections[groupIdx] = sel;
    onChange({ mode: "package", selections: newSelections });
  }

  function setGold(g: number) {
    onChange({ mode: "gold", gold: g });
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Mode toggle */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setMode("package")}
          className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors ${
            isPackage
              ? "border-arcane-500 bg-arcane-50 text-arcane-800"
              : "border-parchment-300 text-parchment-600 hover:border-arcane-400"
          }`}
        >
          Class equipment package
        </button>
        <button
          type="button"
          onClick={() => setMode("gold")}
          className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors ${
            isGold
              ? "border-arcane-500 bg-arcane-50 text-arcane-800"
              : "border-parchment-300 text-parchment-600 hover:border-arcane-400"
          }`}
        >
          Starting gold ({goldLabel(startingEquipment.gold)})
        </button>
      </div>

      {/* ── Package mode ─────────────────────────────────────────────────── */}
      {isPackage && value.mode === "package" && (
        <div className="flex flex-col gap-5">
          {startingEquipment.groups.map((group, groupIdx) => {
            const sel = value.selections[groupIdx];
            const isAutoGrant = group.options.length === 1;
            const chosenOptionIdx = sel?.optionIndex ?? -1;
            const chosenBundle =
              chosenOptionIdx >= 0 ? group.options[chosenOptionIdx] : null;

            return (
              <div key={groupIdx} className="flex flex-col gap-2">
                {/* Group label */}
                <p className="text-sm font-medium text-parchment-800">
                  {group.label}
                </p>

                {isAutoGrant ? (
                  // Auto-granted — display only, no choice needed
                  <div className="rounded-control border border-parchment-200 bg-parchment-100 px-3 py-2 text-sm text-parchment-700">
                    {bundleFixedSummary(group.options[0])}
                    <span className="ml-2 text-xs text-parchment-600">
                      (auto-granted)
                    </span>
                  </div>
                ) : (
                  // Player picks one option
                  <div className="flex flex-col gap-2">
                    {group.options.map((option, optionIdx) => {
                      const isChosen = chosenOptionIdx === optionIdx;
                      return (
                        <label
                          key={optionIdx}
                          className={`flex cursor-pointer flex-col gap-2 rounded-control border px-3 py-2 transition-colors ${
                            isChosen
                              ? "border-arcane-400 bg-arcane-50"
                              : "border-parchment-200 hover:border-arcane-300"
                          }`}
                        >
                          <div className="flex items-start gap-2">
                            <input
                              type="radio"
                              name={`group-${groupIdx}`}
                              checked={isChosen}
                              onChange={() => setOptionIndex(groupIdx, optionIdx)}
                              className="mt-0.5 accent-arcane-600"
                            />
                            <span className="text-sm text-parchment-800">
                              {option.label}
                            </span>
                          </div>

                          {/* Open picks — only shown when this option is selected */}
                          {isChosen && (option.openPicks?.length ?? 0) > 0 && (
                            <div className="ml-5 flex flex-col gap-2">
                              <OpenPickList
                                bundle={option}
                                catalog={catalog}
                                currentPicks={sel?.openPicks}
                                onPick={(pickIdx, itemName) =>
                                  setOpenPick(groupIdx, pickIdx, itemName)
                                }
                              />
                            </div>
                          )}

                          {/* Fixed item summary for the chosen option */}
                          {isChosen && (option.items?.length ?? 0) > 0 && (
                            <p className="ml-5 text-xs text-parchment-600">
                              {bundleFixedSummary(option)}
                            </p>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* Open picks on an auto-granted bundle (rare but possible) */}
                {isAutoGrant && chosenBundle && (
                  <OpenPickList
                    bundle={chosenBundle}
                    catalog={catalog}
                    currentPicks={sel?.openPicks}
                    onPick={(pickIdx, itemName) => setOpenPick(groupIdx, pickIdx, itemName)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Gold mode ──────────────────────────────────────────────────────── */}
      {isGold && value.mode === "gold" && (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-parchment-700">
            Roll {goldLabel(startingEquipment.gold)} gp (
            {goldMin(startingEquipment.gold)}–{goldMax(startingEquipment.gold)} gp) and spend it on
            equipment from the shop after creation.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setGold(rollGold(startingEquipment.gold))}
              className="rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
            >
              Roll {goldLabel(startingEquipment.gold)}
            </button>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={goldMin(startingEquipment.gold)}
                max={goldMax(startingEquipment.gold)}
                value={value.gold || ""}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  if (!isNaN(n)) setGold(n);
                }}
                placeholder={`${goldMin(startingEquipment.gold)}–${goldMax(startingEquipment.gold)}`}
                className="w-24 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-center text-sm text-parchment-900 focus:border-arcane-500 focus:outline-none"
              />
              <span className="text-sm text-parchment-600">gp</span>
            </div>
          </div>
          {value.gold > 0 && !isGoldValid(startingEquipment, value.gold) && (
            <p className="text-xs text-red-600">
              Amount must be between {goldMin(startingEquipment.gold)} and{" "}
              {goldMax(startingEquipment.gold)} gp.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
