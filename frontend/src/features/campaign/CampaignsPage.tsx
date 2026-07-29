import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type { RulesEdition } from "@character-sheet/shared-types";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EditionPicker from "@/components/ui/EditionPicker";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import { createCampaign, fetchCampaigns } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import { useEditions } from "@/hooks/useEditions";
import type { Campaign, EditionsResponse } from "@/types/character";

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";
const primaryBtn =
  "rounded-control bg-garnet-surface px-4 py-2 text-sm font-semibold text-garnet-on-surface transition-colors hover:bg-garnet-surface-hover disabled:opacity-40";

// The create surface, extracted so CampaignsPage's own render stays a plain
// switch over list-load state — #1436's editions gating pushed the combined
// function past fallow's complexity gate. `editions` arrives as a prop rather
// than from a second useEditions call so the page's error banner and this form
// can never disagree about whether the rows have landed.
function CreateCampaignForm({
  editions,
  onCreated,
  onError,
}: {
  editions: EditionsResponse | null;
  onCreated: () => Promise<void>;
  /** null clears the page's banner — called before each attempt. */
  onError: (message: string | null) => void;
}) {
  const [name, setName] = useState("");
  // null = "the DM hasn't touched the picker", not "2024". A campaign's edition
  // can never be changed, so a UI-side fallback would silently decide a field the
  // DM can't undo (#1436) — the served default is the only default, and a reset
  // back to null re-derives it rather than restating a second literal.
  const [rulesEdition, setRulesEdition] = useState<RulesEdition | null>(null);
  const [pending, setPending] = useState(false);
  const selectedEdition = rulesEdition ?? editions?.defaultEdition ?? null;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    // Submit is disabled without both, so this is the type narrowing plus a
    // belt-and-braces guard against ever posting a guessed edition.
    if (!name.trim() || !selectedEdition) return;
    setPending(true);
    onError(null);
    try {
      await createCampaign(name.trim(), selectedEdition);
      setName("");
      setRulesEdition(null);
      await onCreated();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="flex flex-col gap-3 p-4" onSubmit={handleCreate}>
      <div className="flex flex-col gap-1.5">
        <label className={labelCls} htmlFor="campaign-name">
          Campaign name
        </label>
        <input
          id="campaign-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="The Sunless Citadel"
          className={inputCls}
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={labelCls}>Rules edition</span>
        {/* No picker at all until the rows arrive (#1436) — not a fallback-valued
            one, not a raw EDITION_* key. The label and the irreversibility notice
            still render so the field doesn't pop in. */}
        {editions && selectedEdition && (
          <EditionPicker
            rows={editions.editions}
            value={selectedEdition}
            onChange={setRulesEdition}
            label="Rules edition"
          />
        )}
        <p className="text-xs text-parchment-500">
          Sets the rules every character joining this campaign must use. Can't be changed after the campaign
          is created.
        </p>
      </div>
      {/* Disabled until an edition is actually known: a submit that fell back to
          a literal would write an unchangeable field the DM never saw. */}
      <button type="submit" className={primaryBtn} disabled={pending || !name.trim() || !selectedEdition}>
        Create campaign
      </button>
    </form>
  );
}

// Campaigns hub: lists the campaigns the caller belongs to (real list endpoint),
// plus a create surface. Each card links to the management detail page.
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const showSpinner = useDelayedFlag(campaigns === null);
  const { editions, error: editionsFailed } = useEditions();

  async function load() {
    try {
      setCampaigns(await fetchCampaigns());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load campaigns");
      setCampaigns([]);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="flex-1 bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-garnet-700">
            Shared table
          </p>
          <h1 className="font-display text-2xl font-semibold text-parchment-900">Campaigns</h1>
        </div>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        {(error ?? editionsFailed) && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error ?? "Couldn't load the rules editions — a campaign's edition can't be changed later, so we won't guess. Check your connection and reload."}
          </p>
        )}

        <Card title="Create a campaign" className="p-4">
          <CreateCampaignForm editions={editions} onCreated={load} onError={setError} />
        </Card>

        {campaigns === null ? (
          showSpinner ? <Spinner /> : null
        ) : campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign to get a shareable invite link, or open the invite link your DM sent you to join theirs."
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {campaigns.map((campaign) => (
              <Link
                key={campaign.id}
                to={`/campaigns/${campaign.id}`}
                className="rounded-card border border-parchment-200 bg-parchment-50 p-4 shadow-card transition-colors hover:border-garnet-400"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display text-lg font-semibold text-parchment-900">
                    {campaign.name}
                  </span>
                  {campaign.role && (
                    <Badge tone={campaign.role === "OWNER" ? "garnet" : "neutral"}>
                      {campaign.role === "OWNER" ? "Owner" : "Player"}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-xs text-parchment-600">
                  {campaign.members.length}{" "}
                  {campaign.members.length === 1 ? "member" : "members"}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
