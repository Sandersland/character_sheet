// Custom-spell authoring form. Owns the draft + effect-toggle state.
import { useState } from "react";

import CustomSpellEffectFields from "@/features/spells/CustomSpellEffectFields";
import { BLANK_CUSTOM, INPUT_CLS, LABEL_CLS, SPELL_SCHOOLS, buildCustomSpellPayload } from "@/lib/addSpell";
import type { CustomSpellInput, LearnSpellOperation, SpellSchool } from "@/types/character";

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

        <div>
          <label className={LABEL_CLS} htmlFor="custom-level">Level</label>
          <select
            id="custom-level"
            className={INPUT_CLS}
            value={custom.level}
            onChange={(e) => update({ level: Number(e.target.value) })}
          >
            <option value={0}>Cantrip</option>
            {[1,2,3,4,5,6,7,8,9].map((l) => <option key={l} value={l}>Level {l}</option>)}
          </select>
        </div>

        <div>
          <label className={LABEL_CLS} htmlFor="custom-school">School</label>
          <select
            id="custom-school"
            className={INPUT_CLS}
            value={custom.school}
            onChange={(e) => update({ school: e.target.value as SpellSchool })}
          >
            {SPELL_SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

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

      <div className="rounded-control border border-arcane-200 p-3">
        <label className="mb-2 flex items-center gap-2 text-xs font-semibold text-arcane-800">
          <input
            type="checkbox"
            checked={hasEffect}
            onChange={(e) => setHasEffect(e.target.checked)}
          />
          Enable auto-rolling on cast
        </label>
        {hasEffect && <CustomSpellEffectFields custom={custom} update={update} />}
      </div>

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
