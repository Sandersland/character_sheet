import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

import Badge from "@/components/ui/Badge";
import Card from "@/components/ui/Card";
import EmptyState from "@/components/ui/EmptyState";
import Spinner from "@/components/ui/Spinner";
import { createCampaign, fetchCampaigns, joinCampaign } from "@/api/client";
import { useDelayedFlag } from "@/hooks/useDelayedFlag";
import type { Campaign } from "@/types/character";

const inputCls =
  "w-full min-w-0 box-border rounded-control border border-parchment-300 bg-parchment-50 px-2.5 py-1.5 text-sm text-parchment-900 placeholder:text-parchment-400 focus:border-garnet-500 focus:outline-none";
const labelCls = "block text-xs font-semibold text-parchment-700";
const primaryBtn =
  "rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800 disabled:opacity-40";

// Campaigns hub: lists the campaigns the caller belongs to (real list endpoint),
// plus create/join surfaces. Each card links to the management detail page.
export default function CampaignsPage() {
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const showSpinner = useDelayedFlag(campaigns === null);

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

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);
    try {
      await createCampaign(name.trim());
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create campaign");
    } finally {
      setPending(false);
    }
  }

  async function handleJoin(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    setPending(true);
    setError(null);
    try {
      // Accept either a bare code or a pasted full invite URL (…/join/<code>).
      const raw = code.trim();
      const afterJoin = raw.includes("/join/") ? (raw.split("/join/").pop() ?? raw) : raw;
      const inviteCode = afterJoin.replace(/[/?#].*$/, "");
      await joinCampaign(inviteCode);
      setCode("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join campaign");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="min-h-screen bg-parchment-100">
      <div className="border-b border-parchment-200 bg-parchment-50">
        <div className="mx-auto max-w-4xl px-6 py-5">
          <p className="font-sans text-xs font-semibold uppercase tracking-wide text-garnet-700">
            Shared table
          </p>
          <h1 className="font-display text-2xl font-semibold text-parchment-900">Campaigns</h1>
        </div>
      </div>

      <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-8">
        {error && (
          <p className="rounded-control bg-garnet-50 px-3 py-2 text-sm font-semibold text-garnet-700">
            {error}
          </p>
        )}

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Card title="Create a campaign" className="p-4">
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
              <button type="submit" className={primaryBtn} disabled={pending || !name.trim()}>
                Create campaign
              </button>
            </form>
          </Card>

          <Card title="Join a campaign" className="p-4">
            <form className="flex flex-col gap-3 p-4" onSubmit={handleJoin}>
              <div className="flex flex-col gap-1.5">
                <label className={labelCls} htmlFor="campaign-code">
                  Invite code
                </label>
                <input
                  id="campaign-code"
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Paste an invite code"
                  className={inputCls}
                />
              </div>
              <button type="submit" className={primaryBtn} disabled={pending || !code.trim()}>
                Join campaign
              </button>
            </form>
          </Card>
        </div>

        {campaigns === null ? (
          showSpinner ? <Spinner /> : null
        ) : campaigns.length === 0 ? (
          <EmptyState
            title="No campaigns yet"
            description="Create a campaign to get a shareable invite link, or join one with a code your DM sent you."
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
