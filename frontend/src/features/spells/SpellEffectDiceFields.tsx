// EffectDiceDraft is a narrow structural type, not the concrete HomebrewSpellInput, so the consumer's own `update` passes straight through.
import { INPUT_CLS, LABEL_CLS } from "@/lib/addSpell";

interface EffectDiceDraft {
  effectKind?: "damage" | "heal";
  effectDiceCount?: number;
  effectDiceFaces?: number;
  effectModifier?: number;
  // Multi-instance authoring (#1981/#1984) — count > 1 is what gates the roll-mode select on.
  // upcastInstancesPerLevel's INPUT lives on the parent (HomebrewSpellEffectFields), alongside
  // upcastDicePerLevel; it's in this draft type so clearing the count can clear it too.
  instanceCount?: number;
  instanceRoll?: "each" | "once";
  upcastInstancesPerLevel?: number;
  // Gates the "once" roll-mode option off — attack+once deadlocks the rail (validateHomebrewInstanceFields
  // and validateCustomSpellInstanceCoherence both reject it; this hides the invalid choice up front).
  attackType?: "attack" | "save";
}

interface FieldProps {
  draft: EffectDiceDraft;
  update: (patch: Partial<EffectDiceDraft>) => void;
}

function numberField(value: string): number | undefined {
  return value === "" ? undefined : Number(value);
}

function InstanceCountField({ draft, update }: FieldProps) {
  return (
    <label className="block">
      <span className={LABEL_CLS}>Instance count</span>
      <input
        type="number"
        min={1}
        className={INPUT_CLS}
        value={draft.instanceCount ?? ""}
        onChange={(e) => {
          // < 1 (a typed "0") coerces to unset — min={1} only blocks the stepper, and a stored 0
          // would fail the backend's positive() as a raw 400.
          const instanceCount = e.target.value === "" || Number(e.target.value) < 1 ? undefined : Number(e.target.value);
          // Dropping the count below 2 hides the dependent fields, so clear them in the same
          // patch — a stranded instanceRoll/upcastInstancesPerLevel fails validation against
          // inputs the form no longer renders. Above 1, write the select's displayed "each"
          // default into the draft too, so the stored value matches what the author saw.
          update(
            (instanceCount ?? 1) > 1
              ? { instanceCount, instanceRoll: draft.instanceRoll ?? "each" }
              : { instanceCount, instanceRoll: undefined, upcastInstancesPerLevel: undefined },
          );
        }}
        placeholder="1"
      />
    </label>
  );
}

function InstanceRollField({ draft, update }: FieldProps) {
  return (
    <label className="block">
      <span className={LABEL_CLS}>Damage rolls</span>
      <select
        className={INPUT_CLS}
        value={draft.instanceRoll ?? "each"}
        onChange={(e) => update({ instanceRoll: e.target.value as "each" | "once" })}
      >
        <option value="each">Roll damage per instance</option>
        {draft.attackType !== "attack" && <option value="once">Roll once, apply to every instance</option>}
      </select>
    </label>
  );
}

export default function SpellEffectDiceFields({ draft, update }: FieldProps) {
  return (
    <>
      <label className="block">
        <span className={LABEL_CLS}>Effect type</span>
        <select
          className={INPUT_CLS}
          value={draft.effectKind ?? ""}
          onChange={(e) => update({ effectKind: (e.target.value as "damage" | "heal") || undefined })}
        >
          <option value="">— none —</option>
          <option value="damage">Damage</option>
          <option value="heal">Healing</option>
        </select>
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Dice count</span>
        <input
          type="number"
          min={1}
          className={INPUT_CLS}
          value={draft.effectDiceCount ?? ""}
          onChange={(e) => update({ effectDiceCount: numberField(e.target.value) })}
          placeholder="e.g. 8"
        />
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Dice faces</span>
        <input
          type="number"
          min={2}
          className={INPUT_CLS}
          value={draft.effectDiceFaces ?? ""}
          onChange={(e) => update({ effectDiceFaces: numberField(e.target.value) })}
          placeholder="e.g. 6"
        />
      </label>
      <label className="block">
        <span className={LABEL_CLS}>Flat modifier</span>
        <input
          type="number"
          className={INPUT_CLS}
          value={draft.effectModifier ?? ""}
          onChange={(e) => update({ effectModifier: numberField(e.target.value) })}
          placeholder="0"
        />
      </label>
      <InstanceCountField draft={draft} update={update} />
      {(draft.instanceCount ?? 1) > 1 && <InstanceRollField draft={draft} update={update} />}
    </>
  );
}
