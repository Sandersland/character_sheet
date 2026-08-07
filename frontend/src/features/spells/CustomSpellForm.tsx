// Custom-spell authoring form. Owns the draft + effect-toggle state. The
// level/school selects and the effect-toggle wrapper are shared with
// HomebrewSpellForm (#1787) via SpellLevelSelect/SpellSchoolSelect/
// SpellEffectToggle — identical markup in both was flagged as duplication.
import { useState } from "react";

import CustomSpellEffectFields from "@/features/spells/CustomSpellEffectFields";
import SpellEffectToggle from "@/features/spells/SpellEffectToggle";
import SpellLevelSelect from "@/features/spells/SpellLevelSelect";
import SpellSchoolSelect from "@/features/spells/SpellSchoolSelect";
import { BLANK_CUSTOM, INPUT_CLS, LABEL_CLS, buildCustomSpellPayload } from "@/lib/addSpell";
import type { CustomSpellInput, LearnSpellOperation } from "@/types/character";

interface CustomSpellFormProps {
  busy: boolean;
  onLearn: (op: LearnSpellOperation) => void;
  onClose: () => void;
}

export default function CustomSpellForm({ busy, onLearn, onClose }: CustomSpellFormProps) {
  const [custom, setCustom] = useState<CustomSpellInput>(BLANK_CUSTOM);
  const [hasEffect, setHasEffect] = useState(false);

  const update = (patch: Partial<CustomSpellInput>) => setCustom((p) => ({ ...p, ...patch }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!custom.name.trim()) return;
    onLearn({ type: "learnSpell", custom: buildCustomSpellPayload(custom, hasEffect) });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={LABEL_CLS} htmlFor="custom-name">Spell name *</label>
          <input
            id="custom-name"
            required
            className={INPUT_CLS}
            value={custom.name}
            onChange={(e) => update({ name: e.target.value })}
            placeholder="e.g. Eldritch Blast"
          />
        </div>

        <SpellLevelSelect id="custom-level" value={custom.level} onChange={(level) => update({ level })} />

        <SpellSchoolSelect id="custom-school" value={custom.school} onChange={(school) => update({ school })} />

        <div>
          <label className={LABEL_CLS} htmlFor="custom-casting-time">Casting time</label>
          <input
            id="custom-casting-time"
            className={INPUT_CLS}
            value={custom.castingTime}
            onChange={(e) => update({ castingTime: e.target.value })}
            placeholder="1 action"
          />
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="custom-range">Range</label>
          <input
            id="custom-range"
            className={INPUT_CLS}
            value={custom.range}
            onChange={(e) => update({ range: e.target.value })}
            placeholder="60 ft"
          />
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="custom-duration">Duration</label>
          <input
            id="custom-duration"
            className={INPUT_CLS}
            value={custom.duration}
            onChange={(e) => update({ duration: e.target.value })}
            placeholder="Instantaneous"
          />
        </div>

        <div className="flex gap-4">
          <label className="flex items-center gap-1.5 text-xs text-parchment-700">
            <input
              type="checkbox"
              checked={!!custom.concentration}
              onChange={(e) => update({ concentration: e.target.checked })}
            />
            Concentration
          </label>
          <label className="flex items-center gap-1.5 text-xs text-parchment-700">
            <input
              type="checkbox"
              checked={!!custom.ritual}
              onChange={(e) => update({ ritual: e.target.checked })}
            />
            Ritual
          </label>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL_CLS} htmlFor="custom-description">Description</label>
          <textarea
            id="custom-description"
            rows={3}
            className={`${INPUT_CLS} resize-y`}
            value={custom.description}
            onChange={(e) => update({ description: e.target.value })}
            placeholder="What does this spell do?"
          />
        </div>
      </div>

      <SpellEffectToggle hasEffect={hasEffect} onToggle={setHasEffect}>
        <CustomSpellEffectFields custom={custom} update={update} />
      </SpellEffectToggle>

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className="rounded-control px-3 py-1.5 text-xs font-semibold text-parchment-600 hover:text-parchment-900">
          Cancel
        </button>
        <button
          type="submit"
          disabled={busy || !custom.name.trim()}
          className="rounded-control bg-arcane-700 px-3 py-1.5 text-xs font-semibold text-parchment-50 hover:bg-arcane-800 disabled:opacity-40"
        >
          {busy ? "Saving…" : "Add custom spell"}
        </button>
      </div>
    </form>
  );
}
