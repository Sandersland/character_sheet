import { useEffect, useState } from "react";

import { fetchSpells } from "@/api/client";
import Field from "@/components/ui/Field";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { Plus, Trash2 } from "@/components/ui/icons";
import { ABILITY_OPTIONS, SKILL_OPTIONS } from "@/lib/abilities";
import {
  ADVANTAGE_ON_OPTIONS,
  CAPABILITY_KIND_OPTIONS,
  CAPABILITY_OP_OPTIONS,
  CAPABILITY_TARGET_OPTIONS,
  CAST_RESOURCE_OPTIONS,
  CAST_STAT_MODE_OPTIONS,
  CHARGE_TRIGGER_OPTIONS,
  GRANT_TYPE_OPTIONS,
  PROFICIENCY_KIND_OPTIONS,
  capabilitySummary,
  targetUsesAbilityKey,
  targetUsesSkillKey,
} from "@/lib/capabilities";
import { CONDITION_OPTIONS } from "@/lib/conditions";
import { DAMAGE_TYPES, damageTypeLabel } from "@/lib/damageTypes";
import type {
  CapabilityKind,
  CapabilityTarget,
  CatalogSpell,
  ChargeTrigger,
  GrantType,
  ItemCapability,
  ProficiencyKind,
} from "@/types/character";

interface CapabilityEditorProps {
  capabilities: ItemCapability[];
  onChange: (capabilities: ItemCapability[]) => void;
  /** True when the item is attunable by a spellcaster — gates wielder DC/attack (#528). */
  spellcasterAttunable?: boolean;
}

const NEW_PASSIVE: ItemCapability = { kind: "passiveBonus", target: "ac", op: "add", value: 1 };
const NEW_CAST: ItemCapability = {
  kind: "castSpell",
  resource: "perRestShort",
  uses: 1,
  dcMode: "fixed",
  dcValue: 13,
  attackMode: "fixed",
  attackValue: 5,
};
const NEW_GRANT: ItemCapability = { kind: "grant", grantType: "resistance", grantValueKind: "damageType", grantValue: "fire" };
// Wand of Magic Missiles defaults: 7 charges, regains 1d6+1 daily at dawn (#555).
const NEW_CHARGES: ItemCapability = {
  kind: "charges",
  maxCharges: 7,
  recharge: { trigger: "dawn", dice: { count: 1, faces: 6 }, bonus: 1 },
};

// The key options for a target that names a skill/ability via targetKey.
function keyOptions(target: CapabilityTarget): readonly { key: string; label: string }[] {
  if (targetUsesSkillKey(target)) return SKILL_OPTIONS;
  if (targetUsesAbilityKey(target)) return ABILITY_OPTIONS;
  return [];
}

// DM authoring for an item's passiveBonus capabilities (#546). Each row is a
// {target, op, value|dice, condition} bonus; damage bonuses can be dice-valued
// (e.g. +2d6 fire). Add/remove multiple. Labels resolve through the helpers.
export default function CapabilityEditor({ capabilities, onChange, spellcasterAttunable = false }: CapabilityEditorProps) {
  const [spells, setSpells] = useState<CatalogSpell[]>([]);
  const needSpells = capabilities.some((c) => c.kind === "castSpell");
  useEffect(() => {
    if (needSpells && spells.length === 0) {
      fetchSpells().then(setSpells).catch(() => setSpells([]));
    }
  }, [needSpells, spells.length]);

  function update(index: number, patch: Partial<ItemCapability>) {
    onChange(capabilities.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  function setKind(index: number, kind: CapabilityKind) {
    const next =
      kind === "castSpell" ? NEW_CAST : kind === "grant" ? NEW_GRANT : kind === "charges" ? NEW_CHARGES : NEW_PASSIVE;
    onChange(capabilities.map((c, i) => (i === index ? { ...next } : c)));
  }

  function setSpell(index: number, spellId: string) {
    const spell = spells.find((s) => s.id === spellId);
    if (!spell) return;
    const cap = capabilities[index];
    // A spell only carries a DC (save spells) or an attack bonus (attack spells),
    // never both — utility/buff spells carry neither. Normalize the two fields to
    // the picked spell so a utility spell (e.g. Fly) persists no DC/attack: keep
    // the applicable one, clear the other. (dcMode "wielder" would announce a DC
    // even with a null value, so reset the mode too when it no longer applies.)
    const needsDc = spell.attackType === "save";
    const needsAttack = spell.attackType === "attack";
    update(index, {
      spellId: spell.id,
      spellName: spell.name,
      spellLevel: spell.level,
      castLevel: spell.level,
      concentration: spell.concentration ?? false,
      dcMode: needsDc ? cap.dcMode ?? "fixed" : "fixed",
      dcValue: needsDc ? cap.dcValue ?? 13 : undefined,
      attackMode: needsAttack ? cap.attackMode ?? "fixed" : "fixed",
      attackValue: needsAttack ? cap.attackValue ?? 5 : undefined,
    });
  }

  function setTarget(index: number, target: CapabilityTarget) {
    // Reset targetKey when the new target no longer keys off a skill/ability.
    const opts = keyOptions(target);
    const cap = capabilities[index];
    const targetKey = opts.length > 0 ? (opts.some((o) => o.key === cap.targetKey) ? cap.targetKey : opts[0].key) : undefined;
    update(index, { target, targetKey });
  }

  function toggleDice(index: number, useDice: boolean) {
    update(index, useDice ? { dice: { count: 1, faces: 6 }, value: undefined } : { dice: undefined, value: 1 });
  }

  // Reset the value picker to a sensible default when the grant type changes.
  function setGrantType(index: number, grantType: GrantType) {
    const defaults: Record<GrantType, Partial<ItemCapability>> = {
      resistance: { grantValueKind: "damageType", grantValue: "fire", grantOn: undefined, cantBeSurprised: undefined },
      immunity: { grantValueKind: "damageType", grantValue: "fire", grantOn: undefined, cantBeSurprised: undefined },
      conditionImmunity: { grantValueKind: "condition", grantValue: "poisoned", grantOn: undefined, cantBeSurprised: undefined },
      advantage: { grantOn: "check", grantValueKind: "skill", grantValue: "perception", cantBeSurprised: false },
      proficiency: { grantValueKind: "skill", grantValue: "perception", grantOn: undefined, cantBeSurprised: undefined },
    };
    update(index, { grantType, ...defaults[grantType] });
  }

  function setProfKind(index: number, profKind: ProficiencyKind) {
    const value = profKind === "skill" ? "perception" : profKind === "save" ? "strength" : "";
    update(index, { grantValueKind: profKind, grantValue: value });
  }

  function remove(index: number) {
    onChange(capabilities.filter((_, i) => i !== index));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-parchment-700">Capabilities</span>
        <button
          type="button"
          onClick={() => onChange([...capabilities, { ...NEW_PASSIVE }])}
          className="inline-flex items-center gap-1 text-xs font-semibold text-garnet-700 hover:underline"
        >
          <Plus aria-hidden="true" className="h-3.5 w-3.5" />
          Add capability
        </button>
      </div>

      {capabilities.length === 0 ? (
        <p className="text-xs text-parchment-500">No capabilities. Add a passive bonus or a grant (resistance, proficiency, advantage) to apply while active.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {capabilities.map((cap, index) => {
            const target = cap.target ?? "ac";
            const opts = keyOptions(target);
            const useDice = Boolean(cap.dice);
            // A castSpell's Save DC / Attack fields are only relevant to the
            // referenced spell's roll kind: DC for save spells, attack for attack
            // spells, neither for utility/buff spells (#363 fallout). undefined
            // until a spell is picked or the catalog finishes loading → hide both.
            const spellAttackType =
              cap.kind === "castSpell" ? spells.find((s) => s.id === cap.spellId)?.attackType : undefined;
            const showDc = spellAttackType === "save";
            const showAttack = spellAttackType === "attack";
            return (
              <li
                key={index}
                className="flex flex-col gap-2 rounded-control border border-parchment-200 bg-parchment-50 p-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-parchment-800">{capabilitySummary(cap)}</span>
                  <button
                    type="button"
                    aria-label={`Remove capability ${index + 1}`}
                    onClick={() => remove(index)}
                    className="flex h-6 w-6 items-center justify-center rounded-control text-parchment-500 hover:bg-parchment-200 hover:text-garnet-700"
                  >
                    <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                  </button>
                </div>

                <Field label="Kind" htmlFor={`cap-${index}-kind`}>
                  <Select
                    id={`cap-${index}-kind`}
                    value={cap.kind}
                    onChange={(e) => setKind(index, e.target.value as CapabilityKind)}
                  >
                    {CAPABILITY_KIND_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                {cap.kind === "castSpell" ? (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="Spell" htmlFor={`cap-${index}-spell`}>
                      <Select
                        id={`cap-${index}-spell`}
                        value={cap.spellId ?? ""}
                        onChange={(e) => setSpell(index, e.target.value)}
                      >
                        <option value="" disabled>
                          Choose a spell…
                        </option>
                        {spells.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name} (L{s.level})
                          </option>
                        ))}
                      </Select>
                    </Field>

                    <Field label="Cast at level" htmlFor={`cap-${index}-castlevel`}>
                      <Input
                        id={`cap-${index}-castlevel`}
                        type="number"
                        className="text-parchment-900"
                        value={cap.castLevel ?? cap.spellLevel ?? 0}
                        onChange={(e) => update(index, { castLevel: Number(e.target.value) })}
                      />
                    </Field>

                    <Field label="Resource" htmlFor={`cap-${index}-resource`}>
                      <Select
                        id={`cap-${index}-resource`}
                        value={cap.resource ?? "perRestShort"}
                        onChange={(e) => update(index, { resource: e.target.value as ItemCapability["resource"] })}
                      >
                        {CAST_RESOURCE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>

                    {cap.resource === "charges" ? (
                      <Field label="Charges per cast" htmlFor={`cap-${index}-chargecost`}>
                        <Input
                          id={`cap-${index}-chargecost`}
                          type="number"
                          min={1}
                          className="text-parchment-900"
                          value={cap.chargeCost ?? 1}
                          onChange={(e) => update(index, { chargeCost: Number(e.target.value) })}
                        />
                      </Field>
                    ) : (
                      cap.resource !== "atWill" && (
                        <Field label="Uses per period" htmlFor={`cap-${index}-uses`}>
                          <Input
                            id={`cap-${index}-uses`}
                            type="number"
                            className="text-parchment-900"
                            value={cap.uses ?? 1}
                            onChange={(e) => update(index, { uses: Number(e.target.value) })}
                          />
                        </Field>
                      )
                    )}

                    {showDc && (
                      <Field label="Save DC" htmlFor={`cap-${index}-dcmode`}>
                        <Select
                          id={`cap-${index}-dcmode`}
                          value={cap.dcMode ?? "fixed"}
                          onChange={(e) => update(index, { dcMode: e.target.value as ItemCapability["dcMode"] })}
                        >
                          {CAST_STAT_MODE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} disabled={o.value === "wielder" && !spellcasterAttunable}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    {showDc && cap.dcMode !== "wielder" && (
                      <Field label="DC value" htmlFor={`cap-${index}-dcvalue`}>
                        <Input
                          id={`cap-${index}-dcvalue`}
                          type="number"
                          className="text-parchment-900"
                          value={cap.dcValue ?? 13}
                          onChange={(e) => update(index, { dcValue: Number(e.target.value) })}
                        />
                      </Field>
                    )}

                    {showAttack && (
                      <Field label="Attack bonus" htmlFor={`cap-${index}-atkmode`}>
                        <Select
                          id={`cap-${index}-atkmode`}
                          value={cap.attackMode ?? "fixed"}
                          onChange={(e) => update(index, { attackMode: e.target.value as ItemCapability["attackMode"] })}
                        >
                          {CAST_STAT_MODE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value} disabled={o.value === "wielder" && !spellcasterAttunable}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      </Field>
                    )}

                    {showAttack && cap.attackMode !== "wielder" && (
                      <Field label="Attack value" htmlFor={`cap-${index}-atkvalue`}>
                        <Input
                          id={`cap-${index}-atkvalue`}
                          type="number"
                          className="text-parchment-900"
                          value={cap.attackValue ?? 5}
                          onChange={(e) => update(index, { attackValue: Number(e.target.value) })}
                        />
                      </Field>
                    )}

                    {(showDc || showAttack) && !spellcasterAttunable && (
                      <p className="text-[11px] text-parchment-500 sm:col-span-2">
                        Wielder DC/attack needs the item attunable by a spellcaster; use fixed values otherwise.
                      </p>
                    )}
                  </div>
                ) : cap.kind === "grant" ? (
                  <GrantFields
                    cap={cap}
                    index={index}
                    onGrantType={(t) => setGrantType(index, t)}
                    onProfKind={(k) => setProfKind(index, k)}
                    onUpdate={(patch) => update(index, patch)}
                  />
                ) : cap.kind === "charges" ? (
                  <ChargesFields cap={cap} index={index} onUpdate={(patch) => update(index, patch)} />
                ) : (
                <>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Field label="Affects" htmlFor={`cap-${index}-target`}>
                    <Select
                      id={`cap-${index}-target`}
                      value={target}
                      onChange={(e) => setTarget(index, e.target.value as CapabilityTarget)}
                    >
                      {CAPABILITY_TARGET_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {opts.length > 0 && (
                    <Field label="Which" htmlFor={`cap-${index}-key`}>
                      <Select
                        id={`cap-${index}-key`}
                        value={cap.targetKey ?? opts[0].key}
                        onChange={(e) => update(index, { targetKey: e.target.value })}
                      >
                        {opts.map((o) => (
                          <option key={o.key} value={o.key}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  )}

                  <Field label="Operation" htmlFor={`cap-${index}-op`}>
                    <Select
                      id={`cap-${index}-op`}
                      value={cap.op ?? "add"}
                      onChange={(e) => update(index, { op: e.target.value as ItemCapability["op"] })}
                    >
                      {CAPABILITY_OP_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {useDice ? (
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-semibold text-parchment-700">Dice value</span>
                      <div className="flex items-center gap-1.5">
                        <Input
                          type="number"
                          aria-label={`Capability ${index + 1} dice count`}
                          fullWidth={false}
                          className="w-14 text-center text-parchment-900"
                          value={cap.dice?.count ?? 1}
                          onChange={(e) =>
                            update(index, { dice: { count: Number(e.target.value), faces: cap.dice?.faces ?? 6, damageType: cap.dice?.damageType } })
                          }
                        />
                        <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">d</span>
                        <Input
                          type="number"
                          aria-label={`Capability ${index + 1} dice faces`}
                          fullWidth={false}
                          className="w-14 text-center text-parchment-900"
                          value={cap.dice?.faces ?? 6}
                          onChange={(e) =>
                            update(index, { dice: { count: cap.dice?.count ?? 1, faces: Number(e.target.value), damageType: cap.dice?.damageType } })
                          }
                        />
                        <Input
                          type="text"
                          aria-label={`Capability ${index + 1} damage type`}
                          fullWidth={false}
                          placeholder="type"
                          className="w-24 text-parchment-900"
                          value={cap.dice?.damageType ?? ""}
                          onChange={(e) =>
                            update(index, { dice: { count: cap.dice?.count ?? 1, faces: cap.dice?.faces ?? 6, damageType: e.target.value || undefined } })
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <Field label="Value" htmlFor={`cap-${index}-value`}>
                      <Input
                        id={`cap-${index}-value`}
                        type="number"
                        className="text-parchment-900"
                        value={cap.value ?? 0}
                        onChange={(e) => update(index, { value: Number(e.target.value) })}
                      />
                    </Field>
                  )}
                </div>

                <label className="flex items-center gap-2 text-xs text-parchment-700">
                  <input type="checkbox" checked={useDice} onChange={(e) => toggleDice(index, e.target.checked)} />
                  Dice-valued (e.g. +2d6 fire)
                </label>

                <Field label="Condition (optional)" htmlFor={`cap-${index}-condition`}>
                  <Input
                    id={`cap-${index}-condition`}
                    placeholder="e.g. on hit"
                    value={cap.condition ?? ""}
                    onChange={(e) => update(index, { condition: e.target.value || undefined })}
                  />
                </Field>
                </>
                )}

                <Field label="Description (optional)" htmlFor={`cap-${index}-desc`}>
                  <Input
                    id={`cap-${index}-desc`}
                    value={cap.description ?? ""}
                    onChange={(e) => update(index, { description: e.target.value || undefined })}
                  />
                </Field>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

interface ChargesFieldsProps {
  cap: ItemCapability;
  index: number;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// DM authoring for the item's shared charge pool (#555): max charges, recharge
// trigger, and an optional dice formula ("regains 1d6+1 at dawn"; unchecked =
// refills to max). castSpell capabilities on the same item spend from this pool
// via the "Spends item charges" resource.
function ChargesFields({ cap, index, onUpdate }: ChargesFieldsProps) {
  const recharge = cap.recharge ?? { trigger: "dawn" as ChargeTrigger };
  const rollToRegain = Boolean(recharge.dice);
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label="Max charges" htmlFor={`cap-${index}-maxcharges`}>
        <Input
          id={`cap-${index}-maxcharges`}
          type="number"
          min={1}
          className="text-parchment-900"
          value={cap.maxCharges ?? 7}
          onChange={(e) => onUpdate({ maxCharges: Number(e.target.value) })}
        />
      </Field>

      <Field label="Recharges" htmlFor={`cap-${index}-trigger`}>
        <Select
          id={`cap-${index}-trigger`}
          value={recharge.trigger}
          onChange={(e) => onUpdate({ recharge: { ...recharge, trigger: e.target.value as ChargeTrigger } })}
        >
          {CHARGE_TRIGGER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>

      <label className="flex items-center gap-2 text-xs text-parchment-700 sm:col-span-2">
        <input
          type="checkbox"
          checked={rollToRegain}
          onChange={(e) =>
            onUpdate({
              recharge: e.target.checked
                ? { ...recharge, dice: { count: 1, faces: 6 }, bonus: 1 }
                : { trigger: recharge.trigger },
            })
          }
        />
        Roll to regain (e.g. 1d6+1); unchecked refills to max
      </label>

      {rollToRegain && (
        <div className="flex flex-col gap-1 sm:col-span-2">
          <span className="text-xs font-semibold text-parchment-700">Regain roll</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min={1}
              aria-label={`Capability ${index + 1} recharge dice count`}
              fullWidth={false}
              className="w-14 text-center text-parchment-900"
              value={recharge.dice?.count ?? 1}
              onChange={(e) =>
                onUpdate({ recharge: { ...recharge, dice: { count: Number(e.target.value), faces: recharge.dice?.faces ?? 6 } } })
              }
            />
            <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">d</span>
            <Input
              type="number"
              min={2}
              aria-label={`Capability ${index + 1} recharge dice faces`}
              fullWidth={false}
              className="w-14 text-center text-parchment-900"
              value={recharge.dice?.faces ?? 6}
              onChange={(e) =>
                onUpdate({ recharge: { ...recharge, dice: { count: recharge.dice?.count ?? 1, faces: Number(e.target.value) } } })
              }
            />
            <span aria-hidden="true" className="text-sm font-semibold text-parchment-600">+</span>
            <Input
              type="number"
              min={0}
              aria-label={`Capability ${index + 1} recharge bonus`}
              fullWidth={false}
              className="w-14 text-center text-parchment-900"
              value={recharge.bonus ?? 0}
              onChange={(e) => {
                const bonus = Number(e.target.value);
                onUpdate({ recharge: { ...recharge, bonus: bonus > 0 ? bonus : undefined } });
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

interface GrantFieldsProps {
  cap: ItemCapability;
  index: number;
  onGrantType: (t: GrantType) => void;
  onProfKind: (k: ProficiencyKind) => void;
  onUpdate: (patch: Partial<ItemCapability>) => void;
}

// DM authoring for a grant capability (#529). Value pickers resolve through the
// label helpers — a skill/ability/condition/damage-type is chosen, never typed.
function GrantFields({ cap, index, onGrantType, onProfKind, onUpdate }: GrantFieldsProps) {
  const type = cap.grantType ?? "resistance";
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Field label="Grant" htmlFor={`cap-${index}-grantType`}>
        <Select id={`cap-${index}-grantType`} value={type} onChange={(e) => onGrantType(e.target.value as GrantType)}>
          {GRANT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </Select>
      </Field>

      {(type === "resistance" || type === "immunity") && (
        <Field label="Damage type" htmlFor={`cap-${index}-dmg`}>
          <Select id={`cap-${index}-dmg`} value={cap.grantValue ?? "fire"} onChange={(e) => onUpdate({ grantValueKind: "damageType", grantValue: e.target.value })}>
            {DAMAGE_TYPES.map((t) => (
              <option key={t} value={t}>{damageTypeLabel(t)}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === "conditionImmunity" && (
        <Field label="Condition" htmlFor={`cap-${index}-cond`}>
          <Select id={`cap-${index}-cond`} value={cap.grantValue ?? "poisoned"} onChange={(e) => onUpdate({ grantValueKind: "condition", grantValue: e.target.value })}>
            {CONDITION_OPTIONS.map((o) => (
              <option key={o.key} value={o.key}>{o.label}</option>
            ))}
          </Select>
        </Field>
      )}

      {type === "advantage" && (
        <>
          <Field label="On" htmlFor={`cap-${index}-on`}>
            <Select
              id={`cap-${index}-on`}
              value={cap.grantOn ?? "check"}
              onChange={(e) => {
                const grantOn = e.target.value as ItemCapability["grantOn"];
                // Reset the qualifier to match the new axis so it never keeps a stale key:
                // initiative/attack are whole-axis (no qualifier); a check is per-skill, a
                // save is per-ability. grantValue resets to "All" on any axis change.
                const wholeAxis = grantOn === "initiative" || grantOn === "attack";
                const qualifier = wholeAxis
                  ? { grantValueKind: undefined, grantValue: undefined }
                  : { grantValueKind: grantOn === "save" ? ("save" as const) : ("skill" as const), grantValue: undefined };
                onUpdate({ grantOn, ...qualifier });
              }}
            >
              {ADVANTAGE_ON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {(cap.grantOn === "check" || cap.grantOn === "save" || cap.grantOn === undefined) &&
            (() => {
              // A save is per-ability (STR/DEX/…); a check is per-skill. Pick the matching
              // key list + qualifier so an advantage-on-save grant never stores a skill key.
              const onSave = cap.grantOn === "save";
              const options = onSave ? ABILITY_OPTIONS : SKILL_OPTIONS;
              const valueKind = onSave ? ("save" as const) : ("skill" as const);
              return (
                <Field label={onSave ? "Which save (optional)" : "Which skill (optional)"} htmlFor={`cap-${index}-advkey`}>
                  <Select
                    id={`cap-${index}-advkey`}
                    value={cap.grantValue ?? ""}
                    onChange={(e) => onUpdate({ grantValueKind: valueKind, grantValue: e.target.value || undefined })}
                  >
                    <option value="">All</option>
                    {options.map((o) => (
                      <option key={o.key} value={o.key}>{o.label}</option>
                    ))}
                  </Select>
                </Field>
              );
            })()}
          <label className="flex items-center gap-2 text-xs text-parchment-700 sm:col-span-2">
            <input type="checkbox" checked={cap.cantBeSurprised ?? false} onChange={(e) => onUpdate({ cantBeSurprised: e.target.checked })} />
            Also can&apos;t be surprised (Weapon of Warning)
          </label>
        </>
      )}

      {type === "proficiency" && (
        <>
          <Field label="Proficiency" htmlFor={`cap-${index}-profkind`}>
            <Select id={`cap-${index}-profkind`} value={(cap.grantValueKind as ProficiencyKind) ?? "skill"} onChange={(e) => onProfKind(e.target.value as ProficiencyKind)}>
              {PROFICIENCY_KIND_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
          {cap.grantValueKind === "skill" ? (
            <Field label="Skill" htmlFor={`cap-${index}-profval`}>
              <Select id={`cap-${index}-profval`} value={cap.grantValue ?? "perception"} onChange={(e) => onUpdate({ grantValue: e.target.value })}>
                {SKILL_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </Select>
            </Field>
          ) : cap.grantValueKind === "save" ? (
            <Field label="Saving throw" htmlFor={`cap-${index}-profval`}>
              <Select id={`cap-${index}-profval`} value={cap.grantValue ?? "strength"} onChange={(e) => onUpdate({ grantValue: e.target.value })}>
                {ABILITY_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </Select>
            </Field>
          ) : (
            <Field label="Name" htmlFor={`cap-${index}-profval`}>
              <Input id={`cap-${index}-profval`} placeholder="e.g. Longswords" value={cap.grantValue ?? ""} onChange={(e) => onUpdate({ grantValue: e.target.value || undefined })} />
            </Field>
          )}
        </>
      )}
    </div>
  );
}
