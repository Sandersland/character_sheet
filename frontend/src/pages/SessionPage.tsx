/**
 * SessionPage — the live-play (action-first) mode, reached by navigating to
 * /characters/:id/session after starting a session.
 *
 * Focused on what you DO at the table: take damage/heal, roll equipped weapons'
 * attack and damage (with correct versatile die), spend resources, use inventory,
 * and end the session when you're done.
 *
 * The character sheet (/characters/:id) is the static reference view.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { RollProvider, useRoll } from "@/features/dice/RollContext";
import RollResultToast from "@/features/dice/RollResultToast";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import InventoryList from "@/features/inventory/InventoryList";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import BackendStatus from "@/features/character-meta/BackendStatus";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import { useCharacter } from "@/hooks/useCharacter";
import { useReferenceData } from "@/hooks/useReferenceData";
import { endSession, fetchActiveSession } from "@/api/client";
import { formatRollSpec } from "@/lib/dice";
import type { Character, Session } from "@/types/character";

// ── Attacks panel ─────────────────────────────────────────────────────────────

/**
 * Lists only equipped weapons and provides Attack + Damage roll buttons.
 * Damage uses the server-derived `weapon.damage` spec so the versatile die
 * is always correct for the current loadout (shield present = 1d8, free
 * off-hand = 1d10, etc.).
 */
function AttacksPanel({ character }: { character: Character }) {
  const { roll } = useRoll();

  const equippedWeapons = character.inventory.filter(
    (item) => item.category === "weapon" && item.equipped && item.weapon,
  );

  // Unarmed strike and improvised weapon are derived server-side so Tavern
  // Brawler's modifiers (d4 unarmed, improvised proficiency) are reflected
  // automatically without any client-side feat-inspection logic.
  const { unarmedStrike, improvisedWeapon } = character;
  const unarmedDamageSpec = {
    count: unarmedStrike.damage.count,
    faces: unarmedStrike.damage.faces,
    modifier: unarmedStrike.damage.modifier,
  };
  const unarmedDamageDisplay =
    unarmedStrike.damage.faces === 1
      ? Math.max(1, 1 + unarmedStrike.damage.modifier)  // flat 1 + STR mod, min 1
      : `1d${unarmedStrike.damage.faces}${unarmedStrike.damage.modifier !== 0 ? ` + ${unarmedStrike.damage.modifier}` : ""}`;
  const improvisedDamageSpec = {
    count: improvisedWeapon.damage.count,
    faces: improvisedWeapon.damage.faces,
    modifier: improvisedWeapon.damage.modifier,
  };

  return (
    <div className="flex flex-col divide-y divide-parchment-200">
      {equippedWeapons.length === 0 && (
        <p className="pb-3 text-sm text-parchment-500">
          No weapons equipped. Go to your{" "}
          <Link to={`/characters/${character.id}`} className="text-garnet-700 hover:underline">
            character sheet
          </Link>{" "}
          and use the Equip button on a weapon.
        </p>
      )}
      {equippedWeapons.map((item) => {
        const w = item.weapon!;
        // Use the server-derived damage spec for correct versatile die; fall
        // back to the raw dice fields for catalog items that don't carry damage.
        const damageSpec = w.damage
          ? { count: w.damage.damageDiceCount, faces: w.damage.damageDiceFaces, modifier: w.damage.damageModifier }
          : { count: w.damageDiceCount, faces: w.damageDiceFaces, modifier: w.damageModifier };
        const damageLabel = `${formatRollSpec(damageSpec)} ${w.damage?.damageType ?? w.damageType}`;
        const gripLabel =
          w.damage?.grip === "versatile-two-handed"
            ? " (two-handed)"
            : w.damage?.grip === "two-handed"
              ? " (two-handed)"
              : "";

        return (
          <div key={item.id} className="flex items-center justify-between py-3">
            <div>
              <p className="text-sm font-medium text-parchment-900">{item.name}</p>
              <p className="text-xs text-parchment-500">
                Attack: +{w.attackBonus ?? 0} · Damage: {damageLabel}{gripLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() =>
                  roll(
                    { count: 1, faces: 20, modifier: w.attackBonus ?? 0 },
                    `${item.name} attack`,
                  )
                }
                className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100"
              >
                Attack
              </button>
              <button
                type="button"
                onClick={() =>
                  roll(
                    damageSpec,
                    `${item.name} damage (${w.damage?.damageType ?? w.damageType})`,
                  )
                }
                className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
              >
                Damage
              </button>
            </div>
          </div>
        );
      })}
      {/* Unarmed strike — always available in 5e, always proficient, uses STR.
          Damage die is server-derived: d1 baseline (1 + STR mod, min 1) raised to
          d4 by Tavern Brawler. */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-parchment-900">Unarmed Strike</p>
          <p className="text-xs text-parchment-500">
            Attack: +{unarmedStrike.attackBonus} · Damage: {unarmedDamageDisplay} bludgeoning
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              roll(
                { count: 1, faces: 20, modifier: unarmedStrike.attackBonus },
                "Unarmed strike attack",
              )
            }
            className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100"
          >
            Attack
          </button>
          <button
            type="button"
            onClick={() => roll(unarmedDamageSpec, "Unarmed strike damage (bludgeoning)")}
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            Damage
          </button>
        </div>
      </div>
      {/* Improvised weapon — anyone can pick up an object and swing it (1d4 + STR).
          Attack bonus includes proficiency only with Tavern Brawler. */}
      <div className="flex items-center justify-between py-3">
        <div>
          <p className="text-sm font-medium text-parchment-900">Improvised Weapon</p>
          <p className="text-xs text-parchment-500">
            Attack: {improvisedWeapon.attackBonus >= 0 ? "+" : ""}
            {improvisedWeapon.attackBonus} · Damage:{" "}
            {formatRollSpec(improvisedDamageSpec)} bludgeoning
            {!improvisedWeapon.proficient && (
              <span className="ml-1 italic text-parchment-400">(no proficiency)</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              roll(
                { count: 1, faces: 20, modifier: improvisedWeapon.attackBonus },
                "Improvised weapon attack",
              )
            }
            className="rounded-control border border-garnet-200 bg-garnet-50 px-2.5 py-1 text-xs font-semibold text-garnet-700 transition-colors hover:bg-garnet-100"
          >
            Attack
          </button>
          <button
            type="button"
            onClick={() =>
              roll(improvisedDamageSpec, "Improvised weapon damage (bludgeoning)")
            }
            className="rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100"
          >
            Damage
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SessionPage() {
  return (
    <RollProvider>
      <SessionPageInner />
      <RollResultToast />
    </RollProvider>
  );
}

function SessionPageInner() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { character, error, setCharacter } = useCharacter(id);
  const { reference } = useReferenceData();
  const [session, setSession] = useState<Session | null>(null);
  const [endPending, setEndPending] = useState(false);

  // Resolve the active session on mount. If none found, bounce back to the sheet.
  useEffect(() => {
    if (!id) return;
    fetchActiveSession(id).then((s) => {
      if (!s) {
        navigate(`/characters/${id}`, { replace: true });
      } else {
        setSession(s);
      }
    });
  }, [id, navigate]);

  async function handleEndSession() {
    if (!id || !session) return;
    setEndPending(true);
    try {
      await endSession(id, session.id);
      navigate(`/characters/${id}`);
    } finally {
      setEndPending(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <p className="text-sm text-parchment-600">Couldn't load character. Check the backend.</p>
        <Link to="/" className="text-xs font-semibold text-garnet-700 hover:underline">
          ← All characters
        </Link>
      </div>
    );
  }

  if (character === undefined || session === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-parchment-100">
        <p className="text-sm text-parchment-600">Loading session…</p>
      </div>
    );
  }

  if (character === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100">
        <p className="text-sm text-parchment-600">Character not found.</p>
        <Link to="/" className="text-xs font-semibold text-garnet-700 hover:underline">
          ← All characters
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div>
            <Link
              to={`/characters/${id}`}
              className="text-xs font-semibold text-garnet-700 hover:underline"
            >
              ← Character sheet
            </Link>
            <h1 className="mt-1 font-display text-2xl font-semibold text-parchment-900">
              {character.name}
            </h1>
            <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-parchment-500">
              <span>
                {character.race} {character.class}
                {character.subclass ? ` (${character.subclass})` : ""}
              </span>
              <Badge tone="garnet">Level {character.level}</Badge>
              {session.title && <span className="italic">{session.title}</span>}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <BackendStatus />
            <button
              type="button"
              disabled={endPending}
              onClick={handleEndSession}
              className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:opacity-50"
            >
              End Session
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-6">

        {/* ── Hit points ──────────────────────────────────────────────── */}
        <HitPointTracker character={character} onUpdate={setCharacter} />

        {/* ── Attacks ─────────────────────────────────────────────────── */}
        <Card title="Attacks" className="p-4">
          <AttacksPanel character={character} />
        </Card>

        {/* ── Resources (class pools) ──────────────────────────────────── */}
        {character.class && (
          <Card title="Class Features" className="p-4">
            <ClassFeaturesSection
              character={character}
              referenceClasses={reference?.classes ?? []}
              onUpdate={setCharacter}
            />
          </Card>
        )}

        {/* ── Inventory (equip / use items) ────────────────────────────── */}
        <InventoryList character={character} onUpdate={setCharacter} />

      </main>
    </div>
  );
}
