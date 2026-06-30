import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import Spinner from "@/components/ui/Spinner";
import CampaignInviteLink from "@/features/campaign/CampaignInviteLink";
import { addCharacterToCampaign, fetchCampaign, fetchCharacters } from "@/api/client";
import type { Campaign, CharacterSummary } from "@/types/character";

// The campaign management hub: invite link, roster, and an "Add a character"
// dropdown of the caller's characters not already in this campaign.
export default function CampaignDetailPage() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState<Campaign | null | undefined>(undefined);
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!id) return;
    let active = true;
    // Independent fetches: only a failed campaign load means "not found". A
    // characters-load failure leaves the campaign visible and shows its own error.
    fetchCampaign(id)
      .then((c) => active && setCampaign(c))
      .catch(() => active && setCampaign(null));
    fetchCharacters()
      .then((chars) => active && setCharacters(chars))
      .catch(() => active && setError("Failed to load your characters"));
    return () => {
      active = false;
    };
  }, [id]);

  if (campaign === undefined) return <Spinner variant="page" />;

  if (campaign === null) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-parchment-900">Campaign not found</h1>
        <p className="text-sm text-parchment-600">
          You may not be a member of this campaign, or it no longer exists.
        </p>
        <Link
          to="/campaigns"
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          Back to Campaigns
        </Link>
      </div>
    );
  }

  // Characters the caller owns that can join: not already in this campaign and
  // not committed to a different one (a cross-campaign attach would 409).
  const attachedIds = new Set((campaign.characters ?? []).map((c) => c.id));
  const addable = characters.filter(
    (c) => !attachedIds.has(c.id) && (!c.campaignId || c.campaignId === id),
  );

  async function handleAdd() {
    if (!id || !selected) return;
    setPending(true);
    setError(null);
    try {
      await addCharacterToCampaign(selected, id);
      const refreshed = await fetchCampaign(id);
      setCampaign(refreshed);
      setSelected("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add character");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <Link to="/campaigns" className="text-xs font-semibold text-garnet-700 hover:underline">
            ← All campaigns
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 font-display text-2xl font-semibold text-parchment-900">
            {campaign.name}
            {campaign.role && (
              <Badge tone={campaign.role === "OWNER" ? "garnet" : "neutral"}>
                {campaign.role === "OWNER" ? "Owner" : "Player"}
              </Badge>
            )}
          </h1>
        </div>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error}
          </p>
        )}

        <Card title="Invite" className="p-4">
          <div className="p-4">
            <CampaignInviteLink inviteCode={campaign.inviteCode} />
          </div>
        </Card>

        <Card title="Add a character" className="p-4">
          <div className="flex flex-wrap items-end gap-3 p-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <label className="block text-xs font-semibold text-parchment-700" htmlFor="add-character">
                Your characters
              </label>
              <select
                id="add-character"
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                disabled={addable.length === 0}
                className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none disabled:opacity-50"
              >
                <option value="">
                  {addable.length === 0 ? "No characters to add" : "Select a character…"}
                </option>
                {addable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={handleAdd}
              disabled={pending || !selected}
              className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-40"
            >
              Add character
            </button>
          </div>
        </Card>

        <Card title="Roster" className="p-4">
          <ul className="flex flex-col divide-y divide-parchment-200 p-4">
            {campaign.members.map((member) => {
              const memberCharacters =
                campaign.characters?.filter((c) => c.ownerId === member.userId) ?? [];
              return (
                <li key={member.id} className="flex flex-col gap-1 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-parchment-900">
                      {member.user.name ?? member.user.email ?? "Unknown player"}
                    </span>
                    <Badge tone={member.role === "OWNER" ? "garnet" : "neutral"}>
                      {member.role === "OWNER" ? "Owner" : "Player"}
                    </Badge>
                  </div>
                  {memberCharacters.length > 0 && (
                    <span className="text-xs text-parchment-600">
                      {memberCharacters.map((c) => c.name).join(", ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      </main>
    </div>
  );
}
