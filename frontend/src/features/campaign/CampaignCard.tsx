import { useState } from "react";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import type { Campaign } from "@/types/character";

// One campaign: name, shareable invite link with a copy button, and the
// roster of members (and their attached characters when present).
export default function CampaignCard({ campaign }: { campaign: Campaign }) {
  const [copied, setCopied] = useState(false);

  const inviteUrl = `${window.location.origin}/join/${campaign.inviteCode}`;

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Card title={campaign.name} headingLevel={2} className="p-4">
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-col gap-1.5">
          <label className="block text-xs font-semibold text-parchment-700" htmlFor={`invite-${campaign.id}`}>
            Invite link
          </label>
          <div className="flex gap-2">
            <input
              id={`invite-${campaign.id}`}
              type="text"
              readOnly
              value={inviteUrl}
              className="w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 focus:border-garnet-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={copyInvite}
              className="shrink-0 rounded-control bg-garnet-700 px-3 py-1.5 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-parchment-500">Members</p>
          <ul className="flex flex-col divide-y divide-parchment-200">
            {campaign.members.map((member) => {
              const characters = campaign.characters?.filter((c) => c.ownerId === member.userId) ?? [];
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
                  {characters.length > 0 && (
                    <span className="text-xs text-parchment-600">
                      {characters.map((c) => c.name).join(", ")}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Card>
  );
}
