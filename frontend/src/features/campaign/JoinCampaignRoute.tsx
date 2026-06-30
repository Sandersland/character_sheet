import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import Spinner from "@/components/ui/Spinner";
import { joinCampaign } from "@/api/client";

// Deep-link target for an invite link (/join/:code): joins on mount, then sends
// the user to the Campaigns hub. Shows an inline error if the code is invalid.
export default function JoinCampaignRoute() {
  const { code } = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) return;
    let active = true;
    joinCampaign(code)
      .then(() => {
        if (active) navigate("/campaigns", { replace: true });
      })
      .catch((err: unknown) => {
        if (active) setError(err instanceof Error ? err.message : "Failed to join campaign");
      });
    return () => {
      active = false;
    };
  }, [code, navigate]);

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-parchment-100 px-6 text-center">
        <h1 className="font-display text-2xl font-semibold text-garnet-800">Couldn't join</h1>
        <p className="text-sm text-parchment-600">{error}</p>
        <button
          type="button"
          onClick={() => navigate("/campaigns")}
          className="rounded-control bg-garnet-700 px-4 py-2 text-sm font-semibold text-parchment-50 transition-colors hover:bg-garnet-800"
        >
          Go to Campaigns
        </button>
      </div>
    );
  }

  return <Spinner className="py-16" />;
}
