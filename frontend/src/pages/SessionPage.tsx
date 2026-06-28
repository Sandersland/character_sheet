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

import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { RollProvider } from "@/features/dice/RollContext";
import RollResultToast from "@/features/dice/RollResultToast";
import CompactHpBar from "@/features/hitpoints/CompactHpBar";
import ConditionsStrip from "@/features/conditions/ConditionsStrip";
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
import { clearTurnState } from "@/features/session/turnStatePersistence";
import SessionLog from "@/features/session/SessionLog";
import SessionSummaryModal from "@/features/session/SessionSummaryModal";
import EndSessionPrompt from "@/features/session/EndSessionPrompt";
import { applyExperienceOperations, endSession, fetchActiveSession } from "@/api/client";
import type { Character, Session, ReferenceData } from "@/types/character";

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
    <SessionContent
      character={character}
      session={session}
      reference={reference}
      setCharacter={setCharacter}
      navigate={navigate}
    />
  );
}

// ── SessionContent ─────────────────────────────────────────────────────────────
//
// Extracted into its own component so useTurnState is called with a guaranteed
// non-null character and real sessionId — which means the lazy localStorage
// initializer works correctly and the fallback character object is not needed.

interface SessionContentProps {
  character: Character;
  session: Session;
  reference: ReferenceData | null;
  setCharacter: (c: Character) => void;
  navigate: ReturnType<typeof useNavigate>;
}

function SessionContent({ character, session, reference, setCharacter, navigate }: SessionContentProps) {
  const [activeTab, setActiveTab] = useState("inventory");
  const [endPending, setEndPending] = useState(false);
  // Error from the most recent end-session attempt (shown in the prompt).
  const [endError, setEndError] = useState<string | null>(null);
  // Tracks whether the XP award already landed for the current prompt, so a
  // retry after an endSession failure doesn't award XP twice.
  const awardedRef = useRef(false);
  // Whether the End Session confirm prompt (with optional XP input) is open.
  const [endPromptOpen, setEndPromptOpen] = useState(false);
  // After ending, hold the ended session (with its computed summary) so we can
  // show the recap modal before navigating back to the sheet.
  const [endedSession, setEndedSession] = useState<Session | null>(null);
  // logRefresh bumps whenever character state or a combat log event changes,
  // so the Log tab refreshes on both.
  const [logRefresh, setLogRefresh] = useState(0);

  // Turn/combat state — persisted to localStorage keyed by session.id.
  const turnState = useTurnState(character, session.id);

  function handleCharacterUpdate(updated: Character) {
    setCharacter(updated);
    setLogRefresh((n) => n + 1);
  }

  // Confirm handler from the End Session prompt. KEY ORDERING: XP must be
  // awarded while the session is still active (so it's auto-tagged with this
  // sessionId and flows into the recap's xpGained) BEFORE we end the session.
  //
  // The award and the end are two calls; if the award succeeds but endSession
  // throws, we must NOT re-award on retry (that would double-count the XP).
  // `awardedRef` remembers a landed award for the duration of this prompt and
  // is reset whenever the prompt is (re)opened.
  async function handleConfirmEnd(xpAmount: number) {
    if (!session) return;
    setEndPending(true);
    setEndError(null);
    try {
      if (xpAmount > 0 && !awardedRef.current) {
        await applyExperienceOperations(character.id, [{ type: "award", amount: xpAmount }]);
        awardedRef.current = true;
      }
      // Clear persisted turn state — the session is over either way.
      clearTurnState(session.id);
      const { session: ended } = await endSession(character.id, session.id);
      // Show the recap modal; navigation happens when the modal is dismissed.
      setEndPromptOpen(false);
      setEndedSession(ended);
    } catch (err) {
      // Surface the failure and keep the prompt open. A retry re-attempts
      // endSession only — the award is guarded by awardedRef above.
      setEndError(
        err instanceof Error ? err.message : "Failed to end the session. Please try again."
      );
    } finally {
      setEndPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto flex max-w-4xl flex-wrap items-start justify-between gap-4 px-6 py-4">
          <div>
            <Link
              to={`/characters/${character.id}`}
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
              onClick={() => {
                awardedRef.current = false;
                setEndError(null);
                setEndPromptOpen(true);
              }}
              className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1.5 text-xs font-semibold text-parchment-700 transition-colors hover:bg-parchment-100 disabled:opacity-50"
            >
              End Session
            </button>
          </div>
        </div>
      </div>

      {/* ── Main ──────────────────────────────────────────────────────────── */}
      <main className="mx-auto flex max-w-4xl flex-col gap-4 px-6 py-6">

        {/* ── Compact HP strip — always visible, slim ──────────────────── */}
        <CompactHpBar character={character} />

        {/* ── Active conditions + exhaustion ──────────────────────────── */}
        <ConditionsStrip character={character} onUpdate={handleCharacterUpdate} />

        {/* ── Turn hub — primary surface; inline attack/item pickers live here ── */}
        <TurnHub
          character={character}
          sessionId={session.id}
          turnState={turnState}
          onUpdate={handleCharacterUpdate}
          onLogChanged={() => setLogRefresh((n) => n + 1)}
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
                <InventoryList character={character} onUpdate={handleCharacterUpdate} />
              )}

              {effectiveTab === "spells" && isCaster && (
                <Card title="Spells" className="p-4">
                  <SpellsSection character={character} onUpdate={handleCharacterUpdate} />
                </Card>
              )}

              {effectiveTab === "class" && hasClass && (
                <Card title="Class Features" className="p-4">
                  <ClassFeaturesSection
                    character={character}
                    referenceClasses={reference?.classes ?? []}
                    onUpdate={handleCharacterUpdate}
                  />
                </Card>
              )}

              {effectiveTab === "rest" && (
                <HitPointTracker character={character} onUpdate={handleCharacterUpdate} />
              )}

              {effectiveTab === "log" && (
                <Card title="Session Log" className="p-4">
                  <SessionLog
                    characterId={character.id}
                    sessionId={session.id}
                    refreshKey={logRefresh}
                  />
                </Card>
              )}
            </div>
          );
        })()}

      </main>

      {endPromptOpen && !endedSession && (
        <EndSessionPrompt
          busy={endPending}
          error={endError}
          onConfirm={handleConfirmEnd}
          onCancel={() => {
            setEndError(null);
            setEndPromptOpen(false);
          }}
        />
      )}

      {endedSession && (
        <SessionSummaryModal
          characterId={character.id}
          session={endedSession}
          onClose={() => navigate(`/characters/${character.id}`)}
          onCharacterUpdate={handleCharacterUpdate}
        />
      )}
    </div>
  );
}
