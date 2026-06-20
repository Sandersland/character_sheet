/**
 * ClassFeaturesSection — orchestrator for class feature interaction on the
 * character sheet. Handles subclass selection, resource pool spend/restore,
 * maneuver learn/forget, and the static features list.
 *
 * Mirrors SpellsSection.tsx's pattern: owns busy + error state, fires API
 * calls through the client module, propagates the updated Character via onUpdate.
 */

import { useState } from "react";

import { applyClassTransactions, applyResourceTransactions } from "@/api/client";
import type {
  Character,
  ClassOperation,
  ClassOption,
  LearnManeuverOperation,
  ResourceOperation,
} from "@/types/character";
import AddManeuverPanel from "@/features/class/AddManeuverPanel";
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

  // ── Render ───────────────────────────────────────────────────────────────────

  const hasPools = resources && resources.pools.length > 0;
  const hasManeuvers = resources?.maneuverChoiceCount !== undefined;
  const hasFeatures = resources && resources.features.length > 0;

  return (
    <div className="flex flex-col gap-6">

      {/* ── Error banner ── */}
      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">
          {error}
        </p>
      )}

      {/* ── Subclass header ── */}
      {(character.subclass || needsSubclass) && (
        <div>
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
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
                className="w-full max-w-xs rounded-control border border-parchment-300 bg-white px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
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
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
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
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
              Maneuvers
            </h3>
            {busy && (
              <span className="text-[10px] text-parchment-400">Saving…</span>
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
            <p className="py-3 text-center text-sm text-parchment-400">
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

      {/* ── Class features (static) ── */}
      {hasFeatures && (
        <div>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-parchment-500">
            Class Features
          </h3>
          <ul className="flex flex-col gap-3">
            {resources.features.map((feature) => (
              <li key={`${feature.source}-${feature.name}`}>
                <p className="text-sm font-semibold text-parchment-900">
                  {feature.name}
                  {feature.source === "subclass" && (
                    <span className="ml-1.5 text-[11px] font-normal text-parchment-400">
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
      {!hasPools && !hasManeuvers && !hasFeatures && !character.subclass && !needsSubclass && (
        <p className="py-4 text-center text-sm text-parchment-400">
          No class features available at this level.
        </p>
      )}
    </div>
  );
}
