import { useState } from "react";

// Read-only invite URL with a copy button — shared by the campaign detail header.
export default function CampaignInviteLink({ inviteCode }: { inviteCode: string }) {
  const [copied, setCopied] = useState(false);
  const inviteUrl = `${window.location.origin}/join/${inviteCode}`;

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
    <div className="flex flex-col gap-1.5">
      <label className="block text-xs font-semibold text-parchment-700" htmlFor="campaign-invite">
        Invite link
      </label>
      <div className="flex gap-2">
        <input
          id="campaign-invite"
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
  );
}
