/**
 * ClassFeaturesSection — orchestrator for class feature interaction on the
 * character sheet. Handles subclass selection, resource pool spend/restore,
 * maneuver learn/forget, and the static features list.
 *
 * Mirrors SpellsSection.tsx's pattern: owns busy + error state, fires API
 * calls through the client module, propagates the updated Character via onUpdate.
 */

import { useState } from "react";

import { applyChannelDivinityTransactions, applyClassTransactions, applyConditionTransactions, applyDisciplineTransactions, applyResourceTransactions, applyShadowArtsTransactions } from "@/api/client";
import type {
  AddClassOperation,
  CastChannelDivinityOperation,
  CastDisciplineOperation,
  CastShadowArtOperation,
  ChannelDivinityOperation,
  Character,
  ClassEntry,
  ClassOperation,
  ClassOption,
  ConditionOperation,
  DisciplineOperation,
  FightingStyleKey,
  ForgetDisciplineOperation,
  LearnDisciplineOperation,
  LearnManeuverOperation,
  ResourceOperation,
  ShadowArtOperation,
  SwapDisciplineOperation,
} from "@/types/character";
import { fightingStyleLabel, FIGHTING_STYLE_DESCRIPTIONS } from "@/lib/fightingStyles";
import { isMulticlass } from "@/lib/multiclass";
import AddClassPanel from "@/features/class/AddClassPanel";
import AddManeuverPanel from "@/features/class/AddManeuverPanel";
import ChannelDivinitySection from "@/features/class/ChannelDivinitySection";
import CloakOfShadowsSection from "@/features/class/CloakOfShadowsSection";
import DisciplinesSection from "@/features/class/DisciplinesSection";
import ShadowArtsSection from "@/features/class/ShadowArtsSection";
import FightingStylePanel from "@/features/class/FightingStylePanel";
import ManeuverRow from "@/features/class/ManeuverRow";
import ResourcePoolRow from "@/features/class/ResourcePoolRow";

interface Props {
  character: Character;
  referenceClasses: ClassOption[];
  onUpdate: (updated: Character) => void;
}

export default function ClassFeaturesSection({ character, referenceClasses, onUpdate }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resources = character.resources;

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Find the reference definition for the character's primary class.
  const classDef = referenceClasses.find((c) => c.name === character.class);

  // Class roster to render — the serialized entries, or a synthesized single
  // entry for a freshly created character whose classes[] hasn't loaded yet.
  const rosterEntries: ClassEntry[] =
    character.classes && character.classes.length > 0
      ? character.classes
      : [{ id: "primary", name: character.class, level: character.level, subclass: character.subclass }];

  // Is the character eligible for a subclass but hasn't chosen one yet?
  const needsSubclass =
    classDef !== undefined &&
    character.level >= classDef.subclassLevel &&
    !character.subclass;

  const maneuverKnownIds = (resources?.maneuversKnown ?? [])
    .filter((m) => m.maneuverId !== undefined)
    .map((m) => m.maneuverId as string);

  // ── Mutation helpers ─────────────────────────────────────────────────────────

  async function sendResource(ops: ResourceOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyResourceTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendDiscipline(ops: DisciplineOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyDisciplineTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendShadowArt(ops: ShadowArtOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyShadowArtsTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendChannelDivinity(ops: ChannelDivinityOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyChannelDivinityTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendCondition(ops: ConditionOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyConditionTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function sendClass(ops: ClassOperation[]) {
    setBusy(true);
    setError(null);
    try {
      const updated = await applyClassTransactions(character.id, ops);
      onUpdate(updated);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  // ── Subclass handlers ────────────────────────────────────────────────────────

  function handleSubclassChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const subclassId = e.target.value;
    if (!subclassId) return;
    sendClass([{ type: "setSubclass", subclassId }]);
  }

  // ── Resource handlers ────────────────────────────────────────────────────────

  function handlePoolOperations(ops: ResourceOperation[]) {
    sendResource(ops);
  }

  function handleLearnManeuver(op: LearnManeuverOperation) {
    sendResource([op]);
  }

  function handleForgetManeuver(entryId: string) {
    sendResource([{ type: "forgetManeuver", entryId }]);
  }

  // ── Discipline handlers ───────────────────────────────────────────────────────

  function handleCastDiscipline(op: CastDisciplineOperation) {
    sendDiscipline([op]);
  }

  function handleLearnDiscipline(op: LearnDisciplineOperation) {
    sendResource([op]);
  }

  function handleForgetDiscipline(op: ForgetDisciplineOperation) {
    sendResource([op]);
  }

  function handleSwapDiscipline(op: SwapDisciplineOperation) {
    sendResource([op]);
  }

  // ── Shadow Arts handler (Way of Shadow) ────────────────────────────────────────

  function handleCastShadowArt(op: CastShadowArtOperation) {
    sendShadowArt([op]);
  }

  // ── Channel Divinity handler (Cleric / Paladin) ────────────────────────────────

  function handleCastChannelDivinity(op: CastChannelDivinityOperation) {
    sendChannelDivinity([op]);
  }

  // ── Cloak of Shadows handler (Way of Shadow L11) ───────────────────────────────

  function handleActivateCloakOfShadows() {
    sendCondition([{ type: "applyCondition", key: "invisible", source: "Cloak of Shadows" }]);
  }

  // ── Fighting style handler ─────────────────────────────────────────────────────

  function handleChooseFightingStyle(key: FightingStyleKey) {
    sendClass([{ type: "setFightingStyle", key }]);
  }

  // ── Add-class (multiclass) handler ────────────────────────────────────────────

  function handleAddClass(op: AddClassOperation) {
    sendClass([op]);
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasPools = resources && resources.pools.length > 0;
  const hasManeuvers = resources?.maneuverChoiceCount !== undefined;
  const hasDisciplines = resources?.disciplineChoiceCount !== undefined;
  const hasShadowArts = resources?.shadowArtsAvailable === true;
  const hasChannelDivinity = resources?.pools.some((p) => p.key === "channelDivinity") ?? false;
  const hasCloakOfShadows = resources?.cloakOfShadowsAvailable === true;
  const hasFeatures = resources && resources.features.length > 0;
  const hasFightingStyle = (resources?.fightingStyleChoiceCount ?? 0) > 0;
  const fightingStyle = resources?.fightingStyle ?? null;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Error banner ── */}
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {/* ── Classes (multiclass roster + add-class) ── */}
      <div>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          {isMulticlass(character.classes) ? "Classes" : "Class"}
        </h3>
        <ul className="mb-3 flex flex-col gap-1.5">
          {rosterEntries.map((entry) => (
            <li
              key={`${entry.name}-${entry.classId ?? ""}`}
              className="flex items-baseline justify-between gap-2 text-sm"
            >
              <span className="font-semibold text-parchment-900">
                {entry.name}
                {entry.subclass ? (
                  <span className="ml-1.5 text-xs font-normal text-parchment-600">
                    {entry.subclass}
                  </span>
                ) : null}
              </span>
              <span className="tabular-nums text-parchment-600">Level {entry.level}</span>
            </li>
          ))}
        </ul>
        {isMulticlass(character.classes) && (
          <p className="mb-3 text-xs text-parchment-600">
            Total character level{" "}
            <span className="font-semibold text-parchment-900">{character.level}</span>
          </p>
        )}
        <AddClassPanel
          character={character}
          referenceClasses={referenceClasses}
          busy={busy}
          onAddClass={handleAddClass}
        />
      </div>

      {/* ── Subclass header ── */}
      {(character.subclass || needsSubclass) && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Subclass
          </h3>
          {character.subclass ? (
            <p className="text-sm font-semibold text-parchment-900">
              {character.subclass}
            </p>
          ) : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-parchment-600">
                You have reached level {classDef!.subclassLevel} — choose a subclass.
              </p>
              <select
                defaultValue=""
                onChange={handleSubclassChange}
                disabled={busy}
                className="w-full max-w-xs rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
              >
                <option value="" disabled>Choose a subclass…</option>
                {(classDef!.subclasses ?? []).map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* ── Resource pools ── */}
      {hasPools && (
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Resources
          </h3>
          <div className="flex flex-col gap-4">
            {resources.pools.map((pool) => (
              <ResourcePoolRow
                key={pool.key}
                characterId={character.id}
                pool={pool}
                busy={busy}
                onOperations={handlePoolOperations}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Maneuvers ── */}
      {hasManeuvers && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
              Maneuvers
            </h3>
            {busy && (
              <span className="text-[10px] text-parchment-600">Saving…</span>
            )}
          </div>

          {/* Maneuver save DC */}
          {resources!.maneuverSaveDC !== undefined && (
            <p className="mb-3 text-xs text-parchment-600">
              Maneuver Save DC:{" "}
              <span className="font-semibold text-parchment-900">
                {resources!.maneuverSaveDC}
              </span>
            </p>
          )}

          {/* Known maneuvers list */}
          {resources!.maneuversKnown.length === 0 ? (
            <p className="py-3 text-center text-sm text-parchment-600">
              No maneuvers learned yet.
            </p>
          ) : (
            <ul className="mb-3 divide-y divide-parchment-200">
              {resources!.maneuversKnown.map((entry) => (
                <ManeuverRow
                  key={entry.id}
                  entry={entry}
                  busy={busy}
                  onForget={handleForgetManeuver}
                />
              ))}
            </ul>
          )}

          {/* Add maneuver inline panel */}
          <AddManeuverPanel
            characterId={character.id}
            knownIds={maneuverKnownIds}
            choiceCount={resources!.maneuverChoiceCount!}
            knownCount={resources!.maneuversKnown.length}
            busy={busy}
            onLearn={handleLearnManeuver}
          />
        </div>
      )}

      {/* ── Elemental Disciplines (Way of the Four Elements) ── */}
      {hasDisciplines && (
        <DisciplinesSection
          character={character}
          choiceCount={resources!.disciplineChoiceCount!}
          saveDC={resources!.disciplineSaveDC}
          disciplinesKnown={resources!.disciplinesKnown ?? []}
          busy={busy}
          onCast={handleCastDiscipline}
          onLearn={handleLearnDiscipline}
          onForget={handleForgetDiscipline}
          onSwap={handleSwapDiscipline}
        />
      )}

      {/* ── Shadow Arts (Way of Shadow) ── */}
      {hasShadowArts && (
        <ShadowArtsSection
          character={character}
          busy={busy}
          onCast={handleCastShadowArt}
        />
      )}

      {/* ── Channel Divinity (Cleric / Paladin) ── */}
      {hasChannelDivinity && (
        <ChannelDivinitySection
          character={character}
          busy={busy}
          onCast={handleCastChannelDivinity}
        />
      )}

      {/* ── Cloak of Shadows (Way of Shadow L11) ── */}
      {hasCloakOfShadows && (
        <CloakOfShadowsSection
          character={character}
          busy={busy}
          onActivate={handleActivateCloakOfShadows}
        />
      )}

      {/* ── Fighting Style (selectable L1 Fighter feature) ── */}
      {hasFightingStyle && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
              Fighting Style
            </h3>
            {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
          </div>

          {fightingStyle ? (
            <div className="mb-3">
              <p className="text-sm font-semibold text-parchment-900">
                {fightingStyleLabel(fightingStyle)}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">
                {FIGHTING_STYLE_DESCRIPTIONS[fightingStyle]}
              </p>
            </div>
          ) : (
            <p className="mb-3 text-xs text-parchment-600">
              Choose a fighting style specialty.
            </p>
          )}

          <FightingStylePanel
            current={fightingStyle}
            busy={busy}
            onChoose={handleChooseFightingStyle}
          />
        </div>
      )}

      {/* ── Class features (static) ── */}
      {hasFeatures && (
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
            Class Features
          </h3>
          <ul className="flex flex-col gap-3">
            {resources.features.map((feature) => (
              <li key={`${feature.source}-${feature.name}`}>
                <p className="text-sm font-semibold text-parchment-900">
                  {feature.name}
                  {feature.source === "subclass" && (
                    <span className="ml-1.5 text-[11px] font-normal text-parchment-600">
                      subclass
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs leading-relaxed text-parchment-600">
                  {feature.description}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Empty state — no class resource data at all */}
      {!hasPools && !hasManeuvers && !hasDisciplines && !hasShadowArts && !hasCloakOfShadows && !hasFeatures && !hasFightingStyle && !character.subclass && !needsSubclass && (
        <p className="py-4 text-center text-sm text-parchment-600">
          No class features available at this level.
        </p>
      )}
    </div>
  );
}
