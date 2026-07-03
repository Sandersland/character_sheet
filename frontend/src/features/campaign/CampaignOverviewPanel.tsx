import { useEffect, useState } from "react";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import CampaignInviteLink from "@/features/campaign/CampaignInviteLink";
import { addCharacterToCampaign, fetchCampaign, fetchCharacters } from "@/api/client";
import type { Campaign, CharacterSummary } from "@/types/character";

interface CampaignOverviewPanelProps {
  campaign: Campaign;
  onCampaignChange: (campaign: Campaign) => void;
}

// Overview tab of the campaign hub: invite link, add-a-character, and roster.
export default function CampaignOverviewPanel({
  campaign,
  onCampaignChange,
}: CampaignOverviewPanelProps) {
  const [characters, setCharacters] = useState<CharacterSummary[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let active = true;
    fetchCharacters()
      .then((chars) => active && setCharacters(chars))
      .catch(() => active && setError("Failed to load your characters"));
    return () => {
      active = false;
    };
  }, []);

  // Characters the caller owns that can join: not already in this campaign and
  // not committed to a different one (a cross-campaign attach would 409).
  const attachedIds = new Set((campaign.characters ?? []).map((c) => c.id));
  const addable = characters.filter(
    (c) => !attachedIds.has(c.id) && (!c.campaignId || c.campaignId === campaign.id),
  );

  async function handleAdd() {
    if (!selected) return;
    setPending(true);
    setError(null);
    try {
      await addCharacterToCampaign(selected, campaign.id);
      const refreshed = await fetchCampaign(campaign.id);
      onCampaignChange(refreshed);
      setSelected("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add character");
    } finally {
      setPending(false);
    }
  }

  return (
    <>
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
              Add one of your characters
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
                {memberCharacters.length > 0 ? (
                  <span className="text-xs text-parchment-600">
                    {memberCharacters.map((c) => c.name).join(", ")}
                  </span>
                ) : (
                  <span className="text-xs italic text-parchment-500">No character yet</span>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
