/**
 * SessionLootPanel — owner-only DM quick-award affordance for live play (#382).
 *
 * Lists the campaign's authored items and awards a chosen one to a session
 * participant in one click, threading the loot event onto this session so it
 * lands in the log + end-of-session recap. Rendered only for the campaign owner
 * (SessionPage gates on the campaign role).
 */

import { useEffect, useState } from "react";

import { awardCampaignItem, fetchCampaignItems } from "@/api/client";
import Badge from "@/components/ui/Badge";
import Spinner from "@/components/ui/Spinner";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { CampaignItem } from "@/types/character";

interface Recipient {
  id: string;
  name: string;
}

interface SessionLootPanelProps {
  campaignId: string;
  sessionId: string;
  /** Session participants awardable as loot recipients (id + name). */
  recipients: Recipient[];
  /** Bumped after a successful award so the Log tab refreshes. */
  onAwarded: () => void;
}

export default function SessionLootPanel({
  campaignId,
  sessionId,
  recipients,
  onAwarded,
}: SessionLootPanelProps) {
  const [items, setItems] = useState<CampaignItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recipientId, setRecipientId] = useState(recipients[0]?.id ?? "");
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [awardError, setAwardError] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(!items && !error);

  useEffect(() => {
    fetchCampaignItems(campaignId)
      .then(setItems)
      .catch(() => setError("Couldn't load campaign items — try again."));
  }, [campaignId]);

  async function handleAward(item: CampaignItem) {
    if (!recipientId || busyItemId) return;
    setBusyItemId(item.id);
    setAwardError(null);
    setFlash(null);
    try {
      await awardCampaignItem(campaignId, item.id, { characterId: recipientId, sessionId });
      const to = recipients.find((r) => r.id === recipientId)?.name ?? "player";
      setFlash(`Awarded ${item.name} to ${to}.`);
      onAwarded();
    } catch (err) {
      setAwardError(err instanceof Error ? err.message : "Failed to award item.");
    } finally {
      setBusyItemId(null);
    }
  }

  if (error) {
    return <p className="text-xs font-semibold text-garnet-700">{error}</p>;
  }
  if (!items) {
    return showSpinner ? <Spinner /> : null;
  }
  if (recipients.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-parchment-600">
        No participants to award loot to yet.
      </p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-parchment-600">
        No campaign items yet — author items in the campaign to award them here.
      </p>
    );
  }

  const selectCls =
    "rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="loot-recipient" className="text-xs font-semibold text-parchment-700">
          Award to
        </label>
        <select
          id="loot-recipient"
          className={selectCls}
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
        >
          {recipients.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      {flash && <p className="text-xs font-semibold text-vitality-700">{flash}</p>}
      {awardError && <p className="text-xs font-semibold text-garnet-700">{awardError}</p>}

      <ul className="flex flex-col divide-y divide-parchment-200">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="truncate text-sm text-parchment-900">{item.name}</span>
              {item.rarity && <Badge tone="gold">{item.rarity}</Badge>}
              {item.isUnique && <Badge tone="arcane">unique</Badge>}
            </span>
            <button
              type="button"
              onClick={() => handleAward(item)}
              disabled={busyItemId !== null}
              className="shrink-0 rounded-control bg-garnet-600 px-3 py-1.5 text-xs font-semibold text-parchment-50 transition-colors hover:bg-garnet-700 disabled:opacity-40"
            >
              {busyItemId === item.id ? "Awarding…" : "Award"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
