/**
 * WarriorOfElementsSection — the 2024 Warrior of the Elements block inside
 * ClassFeaturesSection. Renders the subclass's two Focus-spending session
 * actions: the Elemental Attunement toggle (1 Focus, a 10-minute while-active
 * buff) and Elemental Burst (2 Focus, three rolls of the Martial Arts die vs a
 * Dexterity save). The Burst damage total is rolled client-side off the
 * character's already-derived Martial Arts die (unarmedStrike.damage.faces);
 * the server decides full vs half from its own save roll.
 */

import { useState } from "react";

import type { Character, ElementalDamageType, WarriorOfElementsOperation } from "@/types/character";
import { rollSpec } from "@/lib/dice";

// Matches the backend ELEMENTAL_ATTUNEMENT_BUFF_KEY — the while-active buff whose
// presence means Attunement is active.
const ELEMENTAL_ATTUNEMENT_BUFF_KEY = "elementalAttunement";
const ATTUNEMENT_FOCUS_COST = 1;
const BURST_FOCUS_COST = 2;
const DAMAGE_TYPES: ElementalDamageType[] = ["acid", "cold", "fire", "lightning", "thunder"];

interface Props {
  character: Character;
  busy: boolean;
  onOperations: (ops: WarriorOfElementsOperation[]) => void;
}

// Remaining Focus from the character's derived resource pools.
function focusRemaining(character: Character): number {
  return character.resources?.pools.find((p) => p.key === "focus")?.remaining ?? 0;
}

function label(type: ElementalDamageType): string {
  return type.charAt(0).toUpperCase() + type.slice(1);
}

function actionButtonClass(): string {
  return "rounded-control border border-parchment-300 px-3 py-1 text-xs font-semibold text-parchment-800 disabled:opacity-50";
}

function AttunementRow({
  attuned,
  disabled,
  onToggle,
}: {
  attuned: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm">
        <span className="font-semibold text-parchment-800">Elemental Attunement</span>
        <span className="ml-2 text-xs text-parchment-600">
          {attuned ? "Active (no action to end)" : `${ATTUNEMENT_FOCUS_COST} focus`}
        </span>
      </div>
      <button type="button" className={actionButtonClass()} disabled={disabled} onClick={onToggle}>
        {attuned ? "End" : "Attune"}
      </button>
    </div>
  );
}

function BurstRow({
  faces,
  disabled,
  onCast,
}: {
  faces: number;
  disabled: boolean;
  onCast: (damageType: ElementalDamageType, roll: number) => void;
}) {
  const [burstType, setBurstType] = useState<ElementalDamageType>("fire");
  // Three rolls of the Martial Arts die (faces derived backend); server halves on a made save.
  const cast = () => onCast(burstType, rollSpec({ count: 3, faces, modifier: 0 }).total);
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-sm">
        <span className="font-semibold text-parchment-800">Elemental Burst</span>
        <span className="ml-2 text-xs text-parchment-600">{BURST_FOCUS_COST} focus · 3× Martial Arts die</span>
      </div>
      <div className="flex items-center gap-2">
        <label className="sr-only" htmlFor="elemental-burst-type">Burst damage type</label>
        <select
          id="elemental-burst-type"
          className="rounded-control border border-parchment-300 px-2 py-1 text-xs"
          value={burstType}
          disabled={disabled}
          onChange={(e) => setBurstType(e.target.value as ElementalDamageType)}
        >
          {DAMAGE_TYPES.map((t) => (
            <option key={t} value={t}>{label(t)}</option>
          ))}
        </select>
        <button type="button" className={actionButtonClass()} disabled={disabled} onClick={cast}>
          Cast
        </button>
      </div>
    </div>
  );
}

export default function WarriorOfElementsSection({ character, busy, onOperations }: Props) {
  const focusAvailable = focusRemaining(character);
  const attuned = character.activeEffects.buffs.some((b) => b.key === ELEMENTAL_ATTUNEMENT_BUFF_KEY);
  const burstAvailable = character.resources?.elementalBurstAvailable === true;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-parchment-600">
          Warrior of the Elements
        </h3>
        {busy && <span className="text-[10px] text-parchment-600">Saving…</span>}
      </div>

      <p className="mb-3 text-xs text-parchment-600">
        Focus remaining: <span className="font-semibold text-gold-800">{focusAvailable}</span>
      </p>

      {attuned && (
        <p className="mb-3 rounded-control border border-arcane-300 bg-arcane-50 px-3 py-1.5 text-xs text-arcane-800" role="status">
          Elemental Attunement active — Unarmed Strike reach +10 ft; strikes can deal elemental damage.
        </p>
      )}

      <div className="flex flex-col gap-3">
        <AttunementRow
          attuned={attuned}
          disabled={busy || (!attuned && focusAvailable < ATTUNEMENT_FOCUS_COST)}
          onToggle={() => onOperations([{ type: "toggleElementalAttunement", active: !attuned }])}
        />
        {burstAvailable && (
          <BurstRow
            faces={character.unarmedStrike.damage.faces}
            disabled={busy || focusAvailable < BURST_FOCUS_COST}
            onCast={(damageType, roll) => onOperations([{ type: "castElementalBurst", damageType, roll }])}
          />
        )}
      </div>
    </div>
  );
}
