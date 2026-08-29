import { useState } from "react";

import { createCustomSpell, updateCustomSpell } from "@/api/client";
import HomebrewSpellClassFields from "@/features/spells/HomebrewSpellClassFields";
import HomebrewSpellComponentsFields from "@/features/spells/HomebrewSpellComponentsFields";
import HomebrewSpellEffectFields from "@/features/spells/HomebrewSpellEffectFields";
import SpellEffectToggle from "@/features/spells/SpellEffectToggle";
import SpellLevelSelect from "@/features/spells/SpellLevelSelect";
import SpellSchoolSelect from "@/features/spells/SpellSchoolSelect";
import { useReferenceData } from "@/hooks/useReferenceData";
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";
import { BLANK_HOMEBREW_SPELL, buildHomebrewSpellPayload, validateHomebrewSpellDraft } from "@/lib/homebrewSpell";
import type { HomebrewSpellInput } from "@/types/character";
import type { RulesEdition } from "@character-sheet/shared-types";

interface HomebrewSpellFormProps {
  edition: RulesEdition;
  // Unused on the PATCH (editing) path, where edition is write-once on the existing row.
  characterId: string;
  editing?: { id: string; draft: HomebrewSpellInput };
  onSaved: () => void;
  onClose: () => void;
}

export default function HomebrewSpellForm({ edition, characterId, editing, onSaved, onClose }: HomebrewSpellFormProps) {
  const [draft, setDraft] = useState<HomebrewSpellInput>(editing?.draft ?? BLANK_HOMEBREW_SPELL);
  const [hasEffect, setHasEffect] = useState(!!editing?.draft.effectKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { reference } = useReferenceData(edition);

  const update = (patch: Partial<HomebrewSpellInput>) => setDraft((p) => ({ ...p, ...patch }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validateHomebrewSpellDraft(draft, hasEffect);
    if (validationError) {
      setError(validationError);
      return;
    }
    setError(null);
    setBusy(true);
    try {
      const payload = buildHomebrewSpellPayload(draft, hasEffect);
      if (editing) {
        await updateCustomSpell(editing.id, payload);
      } else {
        await createCustomSpell(payload, characterId);
        setDraft(BLANK_HOMEBREW_SPELL);
        setHasEffect(false);
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${editing ? "update" : "create"} spell.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL_CLS} htmlFor="homebrew-name">Spell name *</label>
          <input
            id="homebrew-name"
            required
            className={INPUT_CLS}
            value={draft.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Eldritch Blast"
          />
        </div>

        <SpellLevelSelect id="homebrew-level" value={draft.level} onChange={(level) => update({ level })} />

        <SpellSchoolSelect id="homebrew-school" value={draft.school} onChange={(school) => update({ school })} />

        <div>
          <label className={LABEL_CLS} htmlFor="homebrew-casting-time">Casting time</label>
          <input
            id="homebrew-casting-time"
            className={INPUT_CLS}
            value={draft.castingTime}
            onChange={(e) => update({ castingTime: e.target.value })}
            placeholder="1 action"
          />
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="homebrew-range">Range</label>
          <input
            id="homebrew-range"
            className={INPUT_CLS}
            value={draft.range}
            onChange={(e) => update({ range: e.target.value })}
            placeholder="60 feet"
          />
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="homebrew-duration">Duration</label>
          <input
            id="homebrew-duration"
            className={INPUT_CLS}
            value={draft.duration}
            onChange={(e) => update({ duration: e.target.value })}
            placeholder="Instantaneous"
          />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs text-parchment-700">
            <input
              type="checkbox"
              checked={!!draft.concentration}
              onChange={(e) => update({ concentration: e.target.checked })}
            />
            Concentration
          </label>
          <label className="flex items-center gap-1.5 text-xs text-parchment-700">
            <input
              type="checkbox"
              checked={!!draft.ritual}
              onChange={(e) => update({ ritual: e.target.checked })}
            />
            Ritual
          </label>
        </div>

        <div className="sm:col-span-2">
          {/* Non-null: BLANK_HOMEBREW_SPELL and toHomebrewSpellInput always set `components`. */}
          <HomebrewSpellComponentsFields
            components={draft.components!}
            onChange={(components) => update({ components })}
          />
        </div>

        <div className="sm:col-span-2">
          <HomebrewSpellClassFields
            classes={reference?.classes ?? null}
            selected={draft.classes}
            onChange={(classes) => update({ classes })}
          />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLS} htmlFor="homebrew-description">Description</label>
          <textarea
            id="homebrew-description"
            rows={3}
            className={`${INPUT_CLS} resize-y`}
            value={draft.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What does this spell do?"
          />
        </div>
      </div>

      <SpellEffectToggle hasEffect={hasEffect} onToggle={setHasEffect}>
        <HomebrewSpellEffectFields draft={draft} update={update} />
      </SpellEffectToggle>

      {error && (
        <p className="rounded-control bg-garnet-50 px-3 py-2 text-xs font-semibold text-garnet-700">{error}</p>
      )}

      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !draft.name.trim()}
          className="rounded-control bg-arcane-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-arcane-800 disabled:opacity-40"
        >
          {busy ? "Saving…" : editing ? "Save changes" : "Create homebrew spell"}
        </button>
      </div>
    </form>
  );
}
