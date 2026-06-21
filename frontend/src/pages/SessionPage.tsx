/**
 * SessionPage — the live-play (action-first) mode, reached by navigating to
 * /characters/:id/session after starting a session.
 *
 * Focused on what you DO at the table: take damage/heal, roll equipped weapons'
 * attack and damage (with correct versatile die), spend resources, use inventory,
 * and end the session when you're done.
 *
 * Layout: persistent compact HP strip → TurnHub (turn focus + inline attack/item pickers) →
 * tabbed reference area (Inventory / Spells / Class / Rest).
 *
 * The character sheet (/characters/:id) is the static reference view.
 */

import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { RollProvider } from "@/features/dice/RollContext";
import RollResultToast from "@/features/dice/RollResultToast";
import CompactHpBar from "@/features/hitpoints/CompactHpBar";
import HitPointTracker from "@/features/hitpoints/HitPointTracker";
import InventoryList from "@/features/inventory/InventoryList";
import ClassFeaturesSection from "@/features/class/ClassFeaturesSection";
import SpellsSection from "@/features/spells/SpellsSection";
import TurnHub from "@/features/session/TurnHub";
import BackendStatus from "@/features/character-meta/BackendStatus";
import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Tabs from "@/components/ui/Tabs";
import { useCharacter } from "@/hooks/useCharacter";
import { useReferenceData } from "@/hooks/useReferenceData";
import { useTurnState } from "@/features/session/useTurnState";
import SessionLog from "@/features/session/SessionLog";
import { endSession, fetchActiveSession } from "@/api/client";
import type { Session } from "@/types/character";

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
  const [activeTab, setActiveTab] = useState("inventory");

  // Ephemeral turn-economy state — never persisted, resets on Start/End Turn.
  // Requires a character, so we instantiate the hook after loading. We pass a
  // stable fallback object so hooks are never conditionally called.
  const turnState = useTurnState(character ?? {
    id: "", name: "", race: "", class: "", level: 1, experiencePoints: 0,
    currentLevelThreshold: 0, nextLevelThreshold: null, pendingLevelUps: 0,
    background: "", alignment: "", armorClass: 10, initiativeBonus: 0,
    speed: 30, proficiencyBonus: 2, hitPoints: { current: 0, max: 1, temp: 0, deathSaves: { successes: 0, failures: 0 } },
    hitDice: { total: 1, die: "d8", spent: 0 }, abilityScores: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
    savingThrowProficiencies: [], skills: [], toolProficiencies: [], armorProficiencies: [], weaponProficiencies: [],
    inventory: [], currency: { cp: 0, sp: 0, gp: 0, pp: 0 },
    unarmedStrike: { attackBonus: 0, damage: { count: 1, faces: 1, modifier: 0, damageType: "bludgeoning" } },
    improvisedWeapon: { attackBonus: 0, proficient: false, damage: { count: 1, faces: 4, modifier: 0, damageType: "bludgeoning" } },
    advancements: [], advancementSlots: { total: 0, used: 0 }, journal: [],
  });

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
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">

        {/* ── Compact HP strip — always visible, slim ──────────────────── */}
        <CompactHpBar character={character} />

        {/* ── Turn hub — primary surface; inline attack/item pickers live here ── */}
        <TurnHub
          character={character}
          turnState={turnState}
          onUpdate={setCharacter}
        />

        {/* ── Reference tabs — secondary content ───────────────────────── */}
        {(() => {
          const isCaster = Boolean(character.spellcasting);
          const hasClass = Boolean(character.class);

          // Build the tab list dynamically; conditionally include Spells and
          // Class tabs so we never render components for classless/non-caster chars.
          // Remaining spell slots badge: total remaining across all levels.
          const remainingSlots = isCaster
            ? (character.spellcasting?.slots ?? []).reduce(
                (sum, s) => sum + Math.max(0, s.total - s.used),
                0,
              )
            : 0;

          const tabs = [
            { id: "inventory", label: "Inventory" },
            ...(isCaster
              ? [{
                  id: "spells",
                  label: "Spells",
                  badge: remainingSlots > 0 ? (
                    <span className="ml-1 rounded-full bg-arcane-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {remainingSlots}
                    </span>
                  ) : undefined,
                }]
              : []),
            ...(hasClass ? [{ id: "class", label: "Class" }] : []),
            { id: "rest", label: "Rest & HP" },
            { id: "log", label: "Log" },
          ];

          // If the currently active tab was gated away (e.g. spells tab
          // selected, then character loses spellcasting), fall back.
          const effectiveTab = tabs.some((t) => t.id === activeTab)
            ? activeTab
            : "inventory";

          return (
            <div className="flex flex-col gap-3">
              <Tabs tabs={tabs} active={effectiveTab} onChange={setActiveTab} />

              {effectiveTab === "inventory" && (
                <InventoryList character={character} onUpdate={setCharacter} />
              )}

              {effectiveTab === "spells" && isCaster && (
                <Card title="Spells" className="p-4">
                  <SpellsSection character={character} onUpdate={setCharacter} />
                </Card>
              )}

              {effectiveTab === "class" && hasClass && (
                <Card title="Class Features" className="p-4">
                  <ClassFeaturesSection
                    character={character}
                    referenceClasses={reference?.classes ?? []}
                    onUpdate={setCharacter}
                  />
                </Card>
              )}

              {effectiveTab === "rest" && (
                <HitPointTracker character={character} onUpdate={setCharacter} />
              )}

              {effectiveTab === "log" && session && (
                <Card title="Session Log" className="p-4">
                  <SessionLog
                    characterId={character.id}
                    sessionId={session.id}
                    refreshKey={character}
                  />
                </Card>
              )}
            </div>
          );
        })()}

      </main>
    </div>
  );
}
