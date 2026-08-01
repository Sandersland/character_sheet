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
  EquipmentChoiceGroup,
  Item,
  OpenPick,
  PackageSelection,
  StartingGold,
} from "@/types/character";

interface StartingEquipmentEditorProps {
  /** The selected class's starting-equipment definition (null → skip rendering). */
  startingEquipment: ClassStartingEquipment | null;
  /** Full item catalog, used to populate open-pick weapon dropdowns. */
  catalog: Item[];
  /** Current draft value. */
  value: EquipmentDraft;
  onChange: (draft: EquipmentDraft) => void;
  /** The character's own chosen tool proficiencies (creation toolChoices step,
   *  #1564 PR #1567 fix — catalog item names). A boundToToolChoice pick
   *  (Monk's "Artisan's Tools or Musical Instrument chosen for the tool
   *  proficiency above") filters to exactly these, never the whole catalog —
   *  matching the server's boundToolChoiceError so the picker never offers a
   *  choice the write path would reject (#1336). */
  selectedToolChoices: string[];
  /** #1565: "class" (default) or "background" — a background never has a
   *  gold-roll alternative, so its own mode toggle row never renders at all
   *  (see the toggle's own render-guard below); this only labels the
   *  package-mode button on the rare path where BOTH modes exist. */
  kind?: "class" | "background";
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
  pick: OpenPick;
  catalog: Item[];
  currentPick: string;
  onPick: (itemName: string) => void;
  selectedToolChoices: string[];
}

// The pre-#1564 weapon-only behaviour, unchanged — split out of matchesPick
// purely to keep its own cyclomatic complexity low (mirrors the backend's
// own openPickFilterError -> weaponFilterError split, character-create.ts).
function matchesWeaponFilter(item: Item, pick: OpenPick): boolean {
  return (
    item.category === "weapon" &&
    item.weapon !== undefined &&
    (!pick.filter.weaponClass || item.weapon.weaponClass === pick.filter.weaponClass) &&
    (!pick.filter.range || item.weapon.weaponRange === pick.filter.range)
  );
}

// Mirrors the backend's openPickFilterError dispatch order exactly (#1564): a
// toolCategory filter (if present) gates first; a boundToToolChoice pick
// (Monk's "Artisan's Tools or Musical Instrument chosen for the tool
// proficiency above" — spans two tool categories, so it carries no single
// filter.toolCategory) then requires membership in the character's OWN chosen
// tool proficiencies instead of falling through to the weapon pool. That
// fallback offered every weapon in the catalog, which the server's
// boundToolChoiceError rejects outright — #1336's lesson that a picker
// offering what the write path refuses is a dead end. A plain toolCategory
// pick (no binding) accepts anything in that category; anything else keeps
// the pre-#1564 weapon-only behaviour unchanged.
function matchesPick(item: Item, pick: OpenPick, selectedToolChoices: string[]): boolean {
  if (pick.filter.toolCategory && item.toolCategory !== pick.filter.toolCategory) return false;
  if (pick.boundToToolChoice) return selectedToolChoices.includes(item.name);
  if (pick.filter.toolCategory) return true;
  return matchesWeaponFilter(item, pick);
}

/** A single open-pick dropdown, filtered to the pick's weapon-class/range/
 *  toolCategory/boundToToolChoice constraint (#1564). */
function OpenPickSelect({ pick, catalog, currentPick, onPick, selectedToolChoices }: OpenPickSelectProps) {
  const matchingItems = catalog.filter((item) => matchesPick(item, pick, selectedToolChoices));
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
  selectedToolChoices: string[];
}

/** Renders a bundle's open-pick dropdowns (may be none). */
function OpenPickList({ bundle, catalog, currentPicks, onPick, selectedToolChoices }: OpenPickListProps) {
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
          selectedToolChoices={selectedToolChoices}
        />
      ))}
    </>
  );
}

interface OptionChoiceProps {
  option: EquipmentBundle;
  groupIdx: number;
  isChosen: boolean;
  catalog: Item[];
  currentPicks: string[] | undefined;
  onChoose: () => void;
  onPick: (pickIdx: number, itemName: string) => void;
  selectedToolChoices: string[];
}

// Split out of OptionChoice purely to keep its own cyclomatic complexity low
// — visible only once this option is chosen AND it actually has open picks.
function ChosenOpenPicks({
  isChosen,
  option,
  catalog,
  currentPicks,
  onPick,
  selectedToolChoices,
}: {
  isChosen: boolean;
  option: EquipmentBundle;
  catalog: Item[];
  currentPicks: string[] | undefined;
  onPick: (pickIdx: number, itemName: string) => void;
  selectedToolChoices: string[];
}) {
  if (!isChosen || !option.openPicks?.length) return null;
  return (
    <div className="ml-5 flex flex-col gap-2">
      <OpenPickList
        bundle={option}
        catalog={catalog}
        currentPicks={currentPicks}
        onPick={onPick}
        selectedToolChoices={selectedToolChoices}
      />
    </div>
  );
}

// Same split reasoning as ChosenOpenPicks above.
function ChosenFixedSummary({ isChosen, option }: { isChosen: boolean; option: EquipmentBundle }) {
  if (!isChosen || !option.items?.length) return null;
  return <p className="ml-5 text-xs text-parchment-600">{bundleFixedSummary(option)}</p>;
}

/** One selectable radio option within a player-choice group — split out of
 *  EquipmentGroupCard purely to keep its own cyclomatic complexity low. */
function OptionChoice({
  option,
  groupIdx,
  isChosen,
  catalog,
  currentPicks,
  onChoose,
  onPick,
  selectedToolChoices,
}: OptionChoiceProps) {
  return (
    <label
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
          onChange={onChoose}
          className="mt-0.5 accent-arcane-600"
        />
        <span className="text-sm text-parchment-800">{option.label}</span>
      </div>
      <ChosenOpenPicks
        isChosen={isChosen}
        option={option}
        catalog={catalog}
        currentPicks={currentPicks}
        onPick={onPick}
        selectedToolChoices={selectedToolChoices}
      />
      <ChosenFixedSummary isChosen={isChosen} option={option} />
    </label>
  );
}

interface EquipmentGroupCardProps {
  group: EquipmentChoiceGroup;
  groupIdx: number;
  sel: PackageSelection | undefined;
  catalog: Item[];
  onSetOptionIndex: (groupIdx: number, optionIdx: number) => void;
  onSetOpenPick: (groupIdx: number, pickIdx: number, itemName: string) => void;
  selectedToolChoices: string[];
}

/** One choice group's card — auto-granted display or the player's option
 *  radio list, plus any open picks. Split out of StartingEquipmentEditor
 *  purely to keep its own cyclomatic complexity low. */
function EquipmentGroupCard({
  group,
  groupIdx,
  sel,
  catalog,
  onSetOptionIndex,
  onSetOpenPick,
  selectedToolChoices,
}: EquipmentGroupCardProps) {
  const isAutoGrant = group.options.length === 1;
  const chosenOptionIdx = sel?.optionIndex ?? -1;
  const chosenBundle = chosenOptionIdx >= 0 ? group.options[chosenOptionIdx] : null;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm font-medium text-parchment-800">{group.label}</p>

      {isAutoGrant ? (
        // Auto-granted — display only, no choice needed
        <div className="rounded-control border border-parchment-200 bg-parchment-100 px-3 py-2 text-sm text-parchment-700">
          {bundleFixedSummary(group.options[0])}
          <span className="ml-2 text-xs text-parchment-600">(auto-granted)</span>
        </div>
      ) : (
        // Player picks one option
        <div className="flex flex-col gap-2">
          {group.options.map((option, optionIdx) => (
            <OptionChoice
              key={optionIdx}
              option={option}
              groupIdx={groupIdx}
              isChosen={chosenOptionIdx === optionIdx}
              catalog={catalog}
              currentPicks={sel?.openPicks}
              onChoose={() => onSetOptionIndex(groupIdx, optionIdx)}
              onPick={(pickIdx, itemName) => onSetOpenPick(groupIdx, pickIdx, itemName)}
              selectedToolChoices={selectedToolChoices}
            />
          ))}
        </div>
      )}

      {/* Open picks on an auto-granted bundle (rare but possible) */}
      {isAutoGrant && chosenBundle && (
        <OpenPickList
          bundle={chosenBundle}
          catalog={catalog}
          currentPicks={sel?.openPicks}
          onPick={(pickIdx, itemName) => onSetOpenPick(groupIdx, pickIdx, itemName)}
          selectedToolChoices={selectedToolChoices}
        />
      )}
    </div>
  );
}

interface GoldModeSectionProps {
  gold: StartingGold;
  value: number;
  startingEquipment: ClassStartingEquipment;
  onSetGold: (g: number) => void;
}

/** The "roll for starting gold" mode's content — split out of
 *  StartingEquipmentEditor purely to keep its own cyclomatic complexity low.
 *  Never rendered when `gold` is null (PHB'24 has no roll-for-gold rule at
 *  all, #1564 commit 3) — the caller narrows before mounting this. */
function GoldModeSection({ gold, value, startingEquipment, onSetGold }: GoldModeSectionProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-parchment-700">
        Roll {goldLabel(gold)} gp ({goldMin(gold)}–{goldMax(gold)} gp) and spend it on equipment from the shop
        after creation.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => onSetGold(rollGold(gold))}
          className="rounded-control bg-garnet-surface px-3 py-1.5 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover"
        >
          Roll {goldLabel(gold)}
        </button>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={goldMin(gold)}
            max={goldMax(gold)}
            value={value || ""}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!isNaN(n)) onSetGold(n);
            }}
            placeholder={`${goldMin(gold)}–${goldMax(gold)}`}
            className="w-24 rounded-control border border-parchment-300 bg-parchment-50 px-2 py-1.5 text-center text-sm text-parchment-900 focus:border-arcane-500 focus:outline-none"
          />
          <span className="text-sm text-parchment-600">gp</span>
        </div>
      </div>
      {value > 0 && !isGoldValid(startingEquipment, value) && (
        <p className="text-xs text-red-600">
          Amount must be between {goldMin(gold)} and {goldMax(gold)} gp.
        </p>
      )}
    </div>
  );
}

// Pure draft-transition helpers, hoisted out of StartingEquipmentEditor
// purely to keep its own cyclomatic complexity low (each closure below was
// otherwise a branch fallow's analyzer folds into the enclosing component).
// Each returns the next EquipmentDraft, or null when the transition doesn't
// apply (wrong mode) — the component's own wrappers just guard-and-call
// onChange, never re-implementing the branch.
function draftForMode(startingEquipment: ClassStartingEquipment, mode: "package" | "gold"): EquipmentDraft {
  return mode === "package"
    ? { mode: "package", selections: emptyPackageState(startingEquipment) }
    : { mode: "gold", gold: 0 };
}

function draftWithOptionIndex(
  startingEquipment: ClassStartingEquipment,
  value: EquipmentDraft,
  groupIdx: number,
  optionIdx: number,
): EquipmentDraft | null {
  if (value.mode !== "package") return null;
  const bundle = startingEquipment.groups[groupIdx].options[optionIdx];
  const openPickCount = bundle.openPicks?.length ?? 0;
  const newSelections = [...value.selections];
  newSelections[groupIdx] = { optionIndex: optionIdx, openPicks: Array(openPickCount).fill("") };
  return { mode: "package", selections: newSelections };
}

function draftWithOpenPick(
  value: EquipmentDraft,
  groupIdx: number,
  pickIdx: number,
  itemName: string,
): EquipmentDraft | null {
  if (value.mode !== "package") return null;
  const newSelections = [...value.selections];
  const sel = { ...newSelections[groupIdx] };
  const newPicks = [...(sel.openPicks ?? [])];
  newPicks[pickIdx] = itemName;
  sel.openPicks = newPicks;
  newSelections[groupIdx] = sel;
  return { mode: "package", selections: newSelections };
}

interface ModeToggleProps {
  isPackage: boolean;
  isGold: boolean;
  // NULL when this edition has no roll-for-gold rule at all (PHB'24, #1564)
  // — the toggle to that mode is simply not offered.
  gold: StartingGold | null;
  onSelectPackage: () => void;
  onSelectGold: () => void;
  /** #1565: this editor's own package-mode button label — a background reuse
   *  of this component never has a gold alternative (so this button always
   *  renders alone), but it must still say "Background", not "Class". */
  packageModeLabel: string;
}

// Split out of StartingEquipmentEditor purely to keep its own cyclomatic
// complexity low.
function ModeToggle({ isPackage, isGold, gold, onSelectPackage, onSelectGold, packageModeLabel }: ModeToggleProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={onSelectPackage}
        className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors ${
          isPackage
            ? "border-arcane-500 bg-arcane-50 text-arcane-800"
            : "border-parchment-300 text-parchment-600 hover:border-arcane-400"
        }`}
      >
        {packageModeLabel}
      </button>
      {/* No roll-for-gold path is offered at all when this edition has none
          (PHB'24, #1564) — PHB'24 reaches gold through a lettered package
          option instead (StartingEquipmentOption.gold). */}
      {gold && (
        <button
          type="button"
          onClick={onSelectGold}
          className={`rounded-control border px-3 py-1.5 text-xs font-semibold transition-colors ${
            isGold
              ? "border-arcane-500 bg-arcane-50 text-arcane-800"
              : "border-parchment-300 text-parchment-600 hover:border-arcane-400"
          }`}
        >
          Starting gold ({goldLabel(gold)})
        </button>
      )}
    </div>
  );
}

export default function StartingEquipmentEditor({
  startingEquipment,
  catalog,
  value,
  onChange,
  selectedToolChoices,
  kind = "class",
}: StartingEquipmentEditorProps) {
  if (!startingEquipment) return null;

  const isPackage = value.mode === "package";
  const isGold = value.mode === "gold";
  const packageModeLabel = kind === "background" ? "Background equipment package" : "Class equipment package";
  // NULL when this edition has no roll-for-gold rule at all (PHB'24, #1564
  // commit 3) — narrowed once here so every render below can pass a non-null
  // StartingGold to goldMin/goldMax/goldLabel/rollGold without re-checking.
  const gold = startingEquipment.gold;

  function setOptionIndex(groupIdx: number, optionIdx: number) {
    const next = draftWithOptionIndex(startingEquipment!, value, groupIdx, optionIdx);
    if (next) onChange(next);
  }

  function setOpenPick(groupIdx: number, pickIdx: number, itemName: string) {
    const next = draftWithOpenPick(value, groupIdx, pickIdx, itemName);
    if (next) onChange(next);
  }

  return (
    <div className="flex flex-col gap-5">
      {/* #1565 reviewer fix: package is always available, so the toggle row
          itself is only meaningful when a SECOND mode (gold) also exists — a
          2014 class package. A 2024 class package and every background
          package (gold: null) have exactly one mode, and a one-option toggle
          group is not a real choice, so the whole row is hidden rather than
          rendering a single, unclickable-feeling button. */}
      {gold && (
        <ModeToggle
          isPackage={isPackage}
          isGold={isGold}
          gold={gold}
          onSelectPackage={() => onChange(draftForMode(startingEquipment!, "package"))}
          onSelectGold={() => onChange(draftForMode(startingEquipment!, "gold"))}
          packageModeLabel={packageModeLabel}
        />
      )}

      {isPackage && value.mode === "package" && (
        <div className="flex flex-col gap-5">
          {startingEquipment.groups.map((group, groupIdx) => (
            <EquipmentGroupCard
              key={groupIdx}
              group={group}
              groupIdx={groupIdx}
              sel={value.selections[groupIdx]}
              catalog={catalog}
              onSetOptionIndex={setOptionIndex}
              onSetOpenPick={setOpenPick}
              selectedToolChoices={selectedToolChoices}
            />
          ))}
        </div>
      )}

      {isGold && value.mode === "gold" && gold && (
        <GoldModeSection
          gold={gold}
          value={value.gold}
          startingEquipment={startingEquipment}
          onSetGold={(g) => onChange({ mode: "gold", gold: g })}
        />
      )}
    </div>
  );
}
