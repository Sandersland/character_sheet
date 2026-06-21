/**
 * TurnTracker — action-economy panel for the SessionPage.
 *
 * Shows the player their available Action / Bonus Action / Reaction for the
 * current turn. Provides quick-action buttons for the most common choices
 * (Attack, Cast a Spell, Dodge, etc.), tracks Extra Attack counts, and
 * surfaces the Action Surge button for Fighters with uses remaining.
 *
 * All economy state is EPHEMERAL (see useTurnState). The only server call
 * made here is for Action Surge (spends the actionSurge resource pool via
 * applyResourceTransactions).
 *
 * ⚑ Movement tracking is intentionally excluded (flagged for a future phase).
 * ⚑ Per-class bonus-action specifics (Rage button, Cunning Action, etc.) and
 *   spell-action-economy integration are Phase D.
 */

import { useState } from "react";
import Card from "@/components/ui/Card";
import { applyResourceTransactions } from "@/api/client";
import { UNIVERSAL_ACTIONS } from "@/lib/turnRules";
import type { TurnState, TurnStateActions } from "@/features/session/useTurnState";
import type { Character, AvailableAction } from "@/types/character";

// ── Sub-components ─────────────────────────────────────────────────────────────

/** A single filled/empty pip representing one economy slot. */
function SlotPip({ filled }: { filled: boolean }) {
  return (
    <span
      className={`inline-block h-3 w-3 rounded-full border-2 ${
        filled
          ? "border-garnet-700 bg-garnet-700"
          : "border-parchment-400 bg-transparent"
      }`}
      aria-hidden
    />
  );
}

// ── Small button helpers ───────────────────────────────────────────────────────

function QuickBtn({
  onClick,
  disabled,
  children,
  tone = "neutral",
  title,
}: {
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  tone?: "garnet" | "neutral" | "arcane" | "gold";
  /** Tooltip shown on hover — use for action description or disabled reason. */
  title?: string;
}) {
  const toneClass =
    tone === "garnet"
      ? "border-garnet-200 bg-garnet-50 text-garnet-700 hover:bg-garnet-100"
      : tone === "arcane"
        ? "border-arcane-200 bg-arcane-50 text-arcane-700 hover:bg-arcane-100"
        : tone === "gold"
          ? "border-gold-300 bg-gold-50 text-gold-800 hover:bg-gold-100"
          : "border-parchment-300 bg-parchment-50 text-parchment-700 hover:bg-parchment-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-control border px-2 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${toneClass}`}
    >
      {children}
    </button>
  );
}

// ── Attack counter ─────────────────────────────────────────────────────────────

function AttackCounter({
  total,
  used,
  label,
}: {
  total: number;
  used: number;
  label: string;
}) {
  const remaining = total - used;
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-control border border-garnet-200 bg-garnet-50 px-3 py-1.5">
      <span className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={`inline-block h-2.5 w-2.5 rounded-full ${
              i < used ? "bg-parchment-300" : "bg-garnet-600"
            }`}
          />
        ))}
      </span>
      <span className="text-xs font-medium text-garnet-700">
        {label}: {remaining} of {total} remaining
      </span>
    </div>
  );
}

// ── Main TurnTracker ─────────────────────────────────────────────────────────

interface TurnTrackerProps {
  character: Character;
  turnState: TurnState & TurnStateActions;
  onUpdate: (c: Character) => void;
}

export default function TurnTracker({ character, turnState, onUpdate }: TurnTrackerProps) {
  const {
    phase,
    actionsRemaining,
    bonusActionUsed,
    reactionUsed,
    attack,
    bonusAttack,
    twfAvailable,
    startTurn,
    endTurn,
    consumeAction,
    enterAttackMode,
    consumeBonusAction,
    enterTwfMode,
    consumeReaction,
    grantExtraAction,
  } = turnState;

  const [surgePending, setSurgePending] = useState(false);
  const [showActionMenu, setShowActionMenu] = useState(false);
  const [showBonusMenu, setShowBonusMenu] = useState(false);
  const [showReactionMenu, setShowReactionMenu] = useState(false);

  // Derive available class actions from character data
  const availableActions: AvailableAction[] = character.availableActions ?? [];

  // Separate by cost for rendering
  const classActions = availableActions.filter((a) => a.cost === "action");
  const classBonusActions = availableActions.filter((a) => a.cost === "bonusAction");
  const classReactions = availableActions.filter((a) => a.cost === "reaction");

  // Action Surge: Fighter pool "actionSurge" must have remaining uses.
  const actionSurgePool = character.resources?.pools?.find((p) => p.key === "actionSurge");
  const actionSurgeAvailable = (actionSurgePool?.remaining ?? 0) > 0;
  async function handleActionSurge() {
    if (!actionSurgeAvailable || surgePending) return;
    setSurgePending(true);
    try {
      const updated = await applyResourceTransactions(character.id, [
        { type: "spendResource", key: "actionSurge" },
      ]);
      onUpdate(updated);
      grantExtraAction();
    } catch {
      // Resource spend failed — don't grant the action.
    } finally {
      setSurgePending(false);
    }
  }

  // ── Idle state ───────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <Card className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-semibold text-parchment-800">Your Turn</p>
            <p className="mt-0.5 text-xs text-parchment-500">
              When the DM calls your turn, start tracking your action economy.
            </p>
          </div>
          <button
            type="button"
            onClick={startTurn}
            className="shrink-0 rounded-control border border-garnet-300 bg-garnet-700 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-garnet-800"
          >
            Start Turn
          </button>
        </div>
      </Card>
    );
  }

  // ── Active state ─────────────────────────────────────────────────────────────

  return (
    <Card className="p-4">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <p className="font-semibold text-parchment-800">Your Turn</p>
        <button
          type="button"
          onClick={endTurn}
          className="rounded-control border border-parchment-300 bg-parchment-50 px-3 py-1 text-xs font-semibold text-parchment-600 transition-colors hover:bg-parchment-100"
        >
          End Turn
        </button>
      </div>

      <div className="flex flex-col gap-3">
        {/* ── Action ──────────────────────────────────────────────────────────── */}
        <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlotPip filled={actionsRemaining > 0 || attack !== null} />
              <span className="text-sm font-semibold text-parchment-800">Action</span>
              {actionsRemaining > 0 && (
                <span className="text-xs text-parchment-500">
                  {actionsRemaining} available
                </span>
              )}
              {actionsRemaining === 0 && attack === null && (
                <span className="text-xs text-parchment-400 italic">used</span>
              )}
            </div>
            {actionsRemaining > 0 && (
              <button
                type="button"
                onClick={() => setShowActionMenu((v) => !v)}
                className="text-xs font-medium text-garnet-700 hover:underline"
              >
                {showActionMenu ? "Hide" : "Use Action ▾"}
              </button>
            )}
          </div>

          {/* Attack counter */}
          {attack !== null && (
            <AttackCounter total={attack.total} used={attack.used} label="Attacks" />
          )}

          {/* Action menu */}
          {showActionMenu && actionsRemaining > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* Attack */}
              <QuickBtn
                tone="garnet"
                onClick={() => {
                  enterAttackMode();
                  setShowActionMenu(false);
                }}
              >
                Attack
              </QuickBtn>
              {/* Class-specific action abilities */}
              {classActions.map((a) => (
                <QuickBtn
                  key={a.key}
                  tone={a.enabled ? "arcane" : "neutral"}
                  disabled={!a.enabled}
                  onClick={() => {
                    consumeAction();
                    setShowActionMenu(false);
                  }}
                  title={a.disabledReason}
                >
                  {a.name}
                </QuickBtn>
              ))}
              {/* Universal other actions */}
              {UNIVERSAL_ACTIONS.filter(
                (u) =>
                  u.cost === "action" &&
                  u.key !== "attack" &&
                  !classActions.some((c) => c.key === u.key),
              ).map((u) => (
                <QuickBtn
                  key={u.key}
                  onClick={() => {
                    consumeAction();
                    setShowActionMenu(false);
                  }}
                  title={u.description}
                >
                  {u.label}
                </QuickBtn>
              ))}
            </div>
          )}
        </div>

        {/* ── Bonus Action ──────────────────────────────────────────────────────── */}
        <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlotPip filled={!bonusActionUsed && bonusAttack === null} />
              <span className="text-sm font-semibold text-parchment-800">Bonus Action</span>
              {bonusActionUsed && bonusAttack === null && (
                <span className="text-xs text-parchment-400 italic">used</span>
              )}
            </div>
            {!bonusActionUsed && (
              <button
                type="button"
                onClick={() => setShowBonusMenu((v) => !v)}
                className="text-xs font-medium text-garnet-700 hover:underline"
              >
                {showBonusMenu ? "Hide" : "Use Bonus ▾"}
              </button>
            )}
          </div>

          {/* TWF off-hand counter */}
          {bonusAttack !== null && (
            <AttackCounter
              total={bonusAttack.total}
              used={bonusAttack.used}
              label="Off-hand attack"
            />
          )}

          {/* Bonus action menu */}
          {showBonusMenu && !bonusActionUsed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* Two-Weapon Fighting */}
              {twfAvailable && (
                <QuickBtn
                  tone="garnet"
                  onClick={() => {
                    enterTwfMode();
                    setShowBonusMenu(false);
                  }}
                >
                  Off-hand Attack (TWF)
                </QuickBtn>
              )}
              {/* Class-specific bonus actions */}
              {classBonusActions.map((a) => (
                <QuickBtn
                  key={a.key}
                  tone={a.enabled ? "arcane" : "neutral"}
                  disabled={!a.enabled}
                  onClick={() => {
                    consumeBonusAction();
                    setShowBonusMenu(false);
                  }}
                  title={a.disabledReason}
                >
                  {a.name}
                </QuickBtn>
              ))}
              {/* Generic bonus action */}
              <QuickBtn
                onClick={() => {
                  consumeBonusAction();
                  setShowBonusMenu(false);
                }}
              >
                Other Bonus Action
              </QuickBtn>
            </div>
          )}
        </div>

        {/* ── Reaction ──────────────────────────────────────────────────────────── */}
        <div className="rounded-card border border-parchment-200 bg-parchment-50 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <SlotPip filled={!reactionUsed} />
              <span className="text-sm font-semibold text-parchment-800">Reaction</span>
              {reactionUsed ? (
                <span className="text-xs text-parchment-400 italic">used</span>
              ) : (
                <span className="text-xs text-parchment-500">available</span>
              )}
            </div>
            {!reactionUsed && (
              <button
                type="button"
                onClick={() => setShowReactionMenu((v) => !v)}
                className="text-xs font-medium text-garnet-700 hover:underline"
              >
                {showReactionMenu ? "Hide" : "Use Reaction ▾"}
              </button>
            )}
          </div>

          {showReactionMenu && !reactionUsed && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {/* Class-specific reactions */}
              {classReactions.map((a) => (
                <QuickBtn
                  key={a.key}
                  tone={a.enabled ? "arcane" : "neutral"}
                  disabled={!a.enabled}
                  onClick={() => {
                    consumeReaction();
                    setShowReactionMenu(false);
                  }}
                  title={a.disabledReason}
                >
                  {a.name}
                </QuickBtn>
              ))}
              {/* Universal reaction actions */}
              {UNIVERSAL_ACTIONS.filter(
                (u) =>
                  u.cost === "reaction" &&
                  !classReactions.some((c) => c.key === u.key),
              ).map((u) => (
                <QuickBtn
                  key={u.key}
                  onClick={() => {
                    consumeReaction();
                    setShowReactionMenu(false);
                  }}
                  title={u.description}
                >
                  {u.label}
                </QuickBtn>
              ))}
            </div>
          )}
        </div>

        {/* ── Action Surge (Fighter) ────────────────────────────────────────── */}
        {actionSurgeAvailable && (
          <button
            type="button"
            disabled={surgePending}
            onClick={handleActionSurge}
            className="flex items-center justify-center gap-1.5 rounded-control border border-gold-300 bg-gold-50 px-3 py-2 text-xs font-semibold text-gold-800 shadow-sm transition-colors hover:bg-gold-100 disabled:opacity-50"
          >
            <span>⚡</span>
            <span>Action Surge</span>
            {actionSurgePool && actionSurgePool.remaining > 1 && (
              <span className="text-gold-600">({actionSurgePool.remaining} left)</span>
            )}
          </button>
        )}

        {/* Note about movement */}
        <p className="text-[11px] text-parchment-400 italic">
          ⚑ Movement is not tracked here. Speed / difficult-terrain tracking is a future feature.
        </p>
      </div>
    </Card>
  );
}
